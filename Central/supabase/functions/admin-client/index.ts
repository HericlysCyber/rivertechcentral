import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const out=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});try{
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const auth=req.headers.get("Authorization");if(!auth)return out({ok:false,message:"Não autenticado."},401);
 const u=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const {data:{user}}=await u.auth.getUser();if(!user)return out({ok:false,message:"Sessão inválida."},401);
 const {data:p}=await u.from("perfis").select("tipo,ativo").eq("id",user.id).single();
 if(!p||p.tipo!=="admin"||!p.ativo)return out({ok:false,message:"Sem permissão administrativa."},403);
 const a=createClient(url,service,{auth:{persistSession:false}}),b=await req.json();
 if(b.action==="create_client"){if(!b.name||!b.email||String(b.password).length<6)return out({ok:false,message:"Nome, e-mail e senha de 6+ caracteres são obrigatórios."},400);
  const {data:x,error:e}=await a.auth.admin.createUser({email:String(b.email).trim().toLowerCase(),password:b.password,email_confirm:true,user_metadata:{nome:b.name}});
  if(e||!x.user)return out({ok:false,message:e?.message||"Erro ao criar conta."},400);
  const uid=x.user.id;const {data:c,error:ce}=await a.from("clientes").insert({nome:b.name,codigo:b.code||null,auth_user_id:uid,ativo:true}).select().single();
  if(ce){await a.auth.admin.deleteUser(uid);return out({ok:false,message:ce.message},400)}
  const {error:pe}=await a.from("perfis").upsert({id:uid,nome:b.name,tipo:"cliente",ativo:true});
  if(pe){await a.from("clientes").delete().eq("id",c.id);await a.auth.admin.deleteUser(uid);return out({ok:false,message:pe.message},400)}
  if(Array.isArray(b.moduleIds)&&b.moduleIds.length)await a.from("cliente_modulos").upsert(b.moduleIds.map((id:string)=>({cliente_id:c.id,modulo_id:id,ativo:true})),{onConflict:"cliente_id,modulo_id"});
  return out({ok:true,message:"Cliente cadastrado com sucesso."});
 }
 if(b.action==="reset_password"){if(!b.clientId||String(b.password).length<6)return out({ok:false,message:"Senha inválida."},400);
  const {data:c}=await a.from("clientes").select("auth_user_id").eq("id",b.clientId).single();if(!c?.auth_user_id)return out({ok:false,message:"Cliente sem conta de acesso."},400);
  const {error:e}=await a.auth.admin.updateUserById(c.auth_user_id,{password:b.password});if(e)return out({ok:false,message:e.message},400);
  return out({ok:true,message:"Senha redefinida com sucesso."});
 }
 return out({ok:false,message:"Ação inválida."},400);
}catch(e){return out({ok:false,message:"Erro interno da função."},500)}});