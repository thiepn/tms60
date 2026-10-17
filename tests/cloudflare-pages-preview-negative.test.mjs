import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

test('preview must match independently qualified local checksum manifest',async()=>{
  const trusted=await readFile('dist/SHA256SUMS');
  const server=createServer((request,response)=>{
    const url=new URL(request.url,'http://127.0.0.1');
    if(url.pathname!=='/SHA256SUMS'){
      response.writeHead(404);response.end('Not found');return;
    }
    const modified=Buffer.from(trusted);
    modified[0]=modified[0]===97?98:97;
    response.writeHead(200,{'content-type':'text/plain'});response.end(modified);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  try{
    const output=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['scripts/check-cloudflare-preview.mjs'],{
        env:{...process.env,TMS60_PREVIEW_URL:'http://127.0.0.1:'+port+'/'},
        stdio:['ignore','pipe','pipe']
      });
      let stdout='',stderr='';
      child.stdout.on('data',b=>stdout+=b);
      child.stderr.on('data',b=>stderr+=b);
      child.once('error',reject);
      child.once('close',code=>resolve({code,stdout,stderr}));
    });
    assert.notEqual(output.code,0,'A self-consistent but unqualified deployment must be rejected');
    assert.match(output.stderr,/Preview SHA256SUMS differs from exact locally qualified artifact/);
  }finally{await new Promise(resolve=>server.close(resolve))}
});


async function inspectLocal(mode){
  const server=createServer(async(request,response)=>{
    const path=new URL(request.url,'http://127.0.0.1').pathname;
    if(path==='/index.html'||path==='/app.html'){
      const target=path==='/index.html'?'/':mode==='wrong-redirect'?'/other':'/app';
      response.writeHead(308,{Location:target});response.end();return;
    }
    if(path==='/CNAME'&&mode==='private-leak'){
      response.writeHead(200,{'content-type':'text/plain'});response.end('private-source');return;
    }
    const name=path==='/'?'index.html':path==='/app'?'app.html':path.slice(1);
    if(!/^[a-z0-9._/-]+$/i.test(name)||name.includes('..')){
      response.writeHead(404);response.end('Not found');return;
    }
    try{
      const bytes=await readFile('dist/'+name);
      const payload=mode==='tamper-app'&&name==='app.html'
        ?Buffer.from('TAMPERED-BUT-HTTP-200'):bytes;
      response.writeHead(200,{'content-type':'application/octet-stream'});
      response.end(payload);
    }catch(_){response.writeHead(404);response.end('Not found')}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const port=server.address().port;
    return await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['scripts/check-cloudflare-preview.mjs'],{
        env:{...process.env,TMS60_PREVIEW_URL:'http://127.0.0.1:'+port+'/'},
        stdio:['ignore','pipe','pipe']
      });
      let stdout='',stderr='';
      child.stdout.on('data',b=>stdout+=b);
      child.stderr.on('data',b=>stderr+=b);
      child.once('error',reject);
      child.once('close',code=>resolve({code,stdout,stderr}));
    });
  }finally{await new Promise(resolve=>server.close(resolve))}
}
for(const [mode,reason] of [
  ['tamper-app',/Preview asset differs from tested artifact: app.html/],
  ['wrong-redirect',/Pages redirect target differs from original root-scope routing/],
  ['private-leak',/Preview leaked private source or has SPA fallback/]
]){
  test('read-only preview fails closed on '+mode,async()=>{
    const result=await inspectLocal(mode);
    assert.notEqual(result.code,0,'Invalid preview must never qualify');
    assert.match(result.stderr,reason);
  });
}
