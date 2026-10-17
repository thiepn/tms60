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
