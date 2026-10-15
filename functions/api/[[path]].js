const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const error=(message,status=400)=>json({error:message},status);
const cents=v=>Number(v)/100;
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
const getCookie=(request,key)=>request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(key+'='))?.slice(key.length+1)||'';
const clean=s=>String(s??'').trim();
async function authed(request,db){const t=getCookie(request,'elx_admin');if(!t)return false;const session=await db.prepare('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>?').bind(await hash(t),Date.now()).first();return !!session}
const getSettings=async db=>Object.fromEntries((await db.prepare('SELECT key,value FROM settings').all()).results.map(x=>[x.key,x.value]));
async function log(db,action,detail=''){await db.prepare('INSERT INTO audit_logs(action,detail) VALUES(?,?)').bind(action,detail).run()}
const productMap=p=>({...p,price:cents(p.price_cents),compare_at:cents(p.compare_at_cents||0)});
export async function onRequest({request,env,params}){
 const db=env.DB;if(!db)return error('D1 binding DB is missing. See README.',503);
 const method=request.method;const path='/'+(params.path||[]).join('/');
 try{
  if(path==='/health')return json({ok:true,mode:'test',gateway:'simulation'});
  if(path==='/products'&&method==='GET')return json({products:(await db.prepare('SELECT * FROM products WHERE active=1 ORDER BY id').all()).results.map(productMap)});
  if(path==='/settings'&&method==='GET'){const s=await getSettings(db);return json({shipping_west:cents(s.shipping_west),shipping_east:cents(s.shipping_east),free_shipping_above:cents(s.free_shipping_above),store_name:s.store_name,announcement:s.announcement||'A little nature in every ritual',support_email:s.support_email||'',support_phone:s.support_phone||''})}
  if(path==='/orders'&&method==='POST'){
   const b=await request.json();const items=Array.isArray(b.items)?b.items:[];
   for(const k of ['customer_name','email','phone','address','postcode','city'])if(!clean(b[k])||clean(b[k]).length>250)return error('Please provide valid '+k.replace('_',' '));
   if(!/^\S+@\S+\.\S+$/.test(clean(b.email)))return error('Invalid email');
   if(!['west','east'].includes(b.region)||items.length<1||items.length>30)return error('Invalid region or cart');
   const qtys=new Map();for(const i of items){const id=Number(i.id),qty=Number(i.qty);if(!Number.isInteger(id)||!Number.isInteger(qty)||qty<1||qty>99)return error('Invalid quantity');qtys.set(id,(qtys.get(id)||0)+qty)}
   const ids=[...qtys.keys()];const rows=await db.prepare(`SELECT * FROM products WHERE active=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all();
   if(rows.results.length!==ids.length)return error('Some products are no longer available',409);
   let subtotal=0;for(const p of rows.results){if(qtys.get(p.id)>p.stock)return error('Insufficient stock for '+p.name,409);subtotal+=p.price_cents*qtys.get(p.id)}
   const s=await getSettings(db);const shipping=subtotal>=Number(s.free_shipping_above)?0:Number(b.region==='west'?s.shipping_west:s.shipping_east);
   const id='ELX-'+crypto.randomUUID().slice(0,8).toUpperCase();
   const statements=[db.prepare('INSERT INTO orders(id,customer_name,email,phone,address,postcode,city,region,subtotal_cents,shipping_cents,total_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,...['customer_name','email','phone','address','postcode','city','region'].map(k=>clean(b[k])),subtotal,shipping,subtotal+shipping)];
   for(const p of rows.results)statements.push(db.prepare('INSERT INTO order_items(order_id,product_id,name,price_cents,quantity) VALUES(?,?,?,?,?)').bind(id,p.id,p.name,p.price_cents,qtys.get(p.id)));
   await db.batch(statements);return json({order:{id,total:cents(subtotal+shipping),payment_status:'pending',payment_url:'/payment/?order='+encodeURIComponent(id)}},201);
  }
  if(path.startsWith('/orders/')&&method==='GET'){
   const id=path.slice('/orders/'.length);const o=await db.prepare('SELECT id,total_cents,payment_status,fulfillment_status,created_at FROM orders WHERE id=?').bind(id).first();return o?json({order:{...o,total:cents(o.total_cents)}}):error('Order not found',404);
  }
  // The test gateway is intentionally server-side. It never represents a real charge.
  if(path==='/test-payment'&&method==='POST'){
   if(env.ENABLE_TEST_GATEWAY!=='true')return error('Test gateway is disabled',403);
   const b=await request.json();if(!['success','failure','cancel'].includes(b.outcome))return error('Invalid simulation outcome');
   const o=await db.prepare('SELECT * FROM orders WHERE id=?').bind(clean(b.order_id)).first();if(!o)return error('Order not found',404);
   if(o.payment_status!=='pending')return error('Payment is already finalized',409);
   if(b.outcome==='success'){
    const lines=(await db.prepare('SELECT * FROM order_items WHERE order_id=?').bind(o.id).all()).results;
    // Conditional stock updates and payment state transition in a single D1 batch.
    // D1 batch is transactional; guard insufficient inventory with a preflight check.
    for(const line of lines){const p=await db.prepare('SELECT stock FROM products WHERE id=?').bind(line.product_id).first();if(!p||p.stock<line.quantity)return error('Stock no longer available. Contact the store.',409)}
    const ops=lines.map(l=>db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').bind(l.quantity,l.product_id,l.quantity));
    ops.push(db.prepare("UPDATE orders SET payment_status='paid',paid_at=CURRENT_TIMESTAMP,payment_reference=? WHERE id=? AND payment_status='pending'").bind('SIM-'+crypto.randomUUID().slice(0,10).toUpperCase(),o.id));
    await db.batch(ops);await log(db,'test_payment_success',o.id);
   }else{await db.prepare('UPDATE orders SET payment_status=?,payment_reference=? WHERE id=? AND payment_status=?').bind(b.outcome==='failure'?'failed':'cancelled','SIM-'+b.outcome,o.id,'pending').run();await log(db,'test_payment_'+b.outcome,o.id)}
   return json({ok:true,outcome:b.outcome,order_id:o.id});
  }
  if(path==='/admin/login'&&method==='POST'){
   const b=await request.json();if(!env.ADMIN_PASSWORD||clean(b.password)!==env.ADMIN_PASSWORD)return error('Incorrect password',401);
   const token=random();await db.prepare('INSERT INTO admin_sessions(token_hash,expires_at) VALUES(?,?)').bind(await hash(token),Date.now()+8*3600000).run();
   return json({ok:true},200,{'set-cookie':`elx_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`});
  }
  if(path==='/admin/logout'&&method==='POST'){const t=getCookie(request,'elx_admin');if(t)await db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await hash(t)).run();return json({ok:true},200,{'set-cookie':'elx_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'})}
  if(path.startsWith('/admin/')){
   if(!await authed(request,db))return error('Please sign in',401);
   if(path==='/admin/overview'&&method==='GET'){
    const stats=await db.prepare("SELECT COUNT(*) orders, COALESCE(SUM(CASE WHEN payment_status='paid' THEN total_cents ELSE 0 END),0) paid_cents, SUM(CASE WHEN payment_status='pending' THEN 1 ELSE 0 END) pending FROM orders").first();
    const inventory=await db.prepare('SELECT COUNT(*) products,COALESCE(SUM(stock),0) units, COALESCE(SUM(CASE WHEN stock<=low_stock_threshold THEN 1 ELSE 0 END),0) low_stock FROM products WHERE active=1').first();return json({stats:{...stats,...inventory,paid_total:cents(stats.paid_cents)}});
   }
   if(path==='/admin/products'&&method==='GET')return json({products:(await db.prepare('SELECT * FROM products ORDER BY id DESC').all()).results.map(productMap)});
   if(path==='/admin/products'&&method==='POST'){
    const b=await request.json();const name=clean(b.name),price=Math.round(Number(b.price)*100),stock=Number(b.stock);if(!name||name.length>120||!Number.isSafeInteger(price)||price<0||!Number.isInteger(stock)||stock<0)return error('Invalid product');
    const compare=Math.round(Number(b.compare_at||0)*100),threshold=Number(b.low_stock_threshold??5),weight=Number(b.weight_g??0);if(!Number.isSafeInteger(compare)||compare<0||!Number.isInteger(threshold)||threshold<0||!Number.isInteger(weight)||weight<0)return error('Invalid pricing or inventory fields');const image=clean(b.image);if(image&&!/^https:\/\//i.test(image)&&!/^\/assets\//.test(image))return error('Image must use HTTPS or a local /assets/ path');const vals=[name,clean(b.subtitle),clean(b.description),price,stock,image,clean(b.badge),b.active?1:0,clean(b.sku).slice(0,80),clean(b.category).slice(0,80),compare,threshold,weight,b.featured?1:0];
    if(b.id){await db.prepare('UPDATE products SET name=?,subtitle=?,description=?,price_cents=?,stock=?,image=?,badge=?,active=?,sku=?,category=?,compare_at_cents=?,low_stock_threshold=?,weight_g=?,featured=? WHERE id=?').bind(...vals,Number(b.id)).run()}
    else await db.prepare('INSERT INTO products(name,subtitle,description,price_cents,stock,image,badge,active,sku,category,compare_at_cents,low_stock_threshold,weight_g,featured) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...vals).run();
    await log(db,'product_saved',name);return json({ok:true});
   }
   if(path==='/admin/orders'&&method==='GET'){
    const orders=(await db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 250').all()).results;
    const items=(await db.prepare('SELECT * FROM order_items WHERE order_id IN (SELECT id FROM orders ORDER BY created_at DESC LIMIT 250)').all()).results;
    return json({orders:orders.map(o=>({...o,total:cents(o.total_cents),subtotal:cents(o.subtotal_cents),shipping:cents(o.shipping_cents),items:items.filter(i=>i.order_id===o.id).map(i=>({...i,price:cents(i.price_cents)}))}))});
   }
   if(path==='/admin/orders/status'&&method==='POST'){
    const b=await request.json();const o=await db.prepare('SELECT * FROM orders WHERE id=?').bind(clean(b.id)).first();if(!o)return error('Order not found',404);
    if(!['unfulfilled','processing','shipped','delivered','cancelled'].includes(b.fulfillment_status))return error('Invalid status');
    if(o.payment_status!=='paid'&&!['unfulfilled','cancelled'].includes(b.fulfillment_status))return error('Unpaid orders cannot be fulfilled',409);
    await db.prepare('UPDATE orders SET fulfillment_status=?,courier=?,tracking_number=? WHERE id=?').bind(b.fulfillment_status,clean(b.courier),clean(b.tracking_number),o.id).run();await log(db,'fulfillment_updated',o.id+' '+b.fulfillment_status);return json({ok:true});
   }
   if(path==='/admin/settings'&&method==='POST'){
    const b=await request.json();for(const k of ['shipping_west','shipping_east','free_shipping_above']){const n=Math.round(Number(b[k])*100);if(!Number.isSafeInteger(n)||n<0)return error('Invalid shipping price');await db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,String(n)).run()}for(const k of ['announcement','support_email','support_phone'])if(b[k]!==undefined){await db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,clean(b[k]).slice(0,240)).run()}await log(db,'settings_updated');return json({ok:true});
   }
   if(path==='/admin/audit'&&method==='GET')return json({logs:(await db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 80').all()).results});
  }
  return error('Not found',404);
 }catch(e){console.error(e);return error('Request could not be completed',500)}
}
