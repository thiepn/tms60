// Rebuild staged PWA icons from original favicon.svg embedded source-owned artwork.
// No network or third-party dependencies; fail closed on corrupt source art.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {deflateSync,inflateSync} from 'node:zlib';

const SIG=Buffer.from('89504e470d0a1a0a','hex');
const CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{
  let crc=n;
  for(let i=0;i<8;i++)crc=(crc&1)?(0xedb88320^(crc>>>1)):(crc>>>1);
  return crc>>>0;
});
function crc32(buf){let c=0xffffffff;for(const b of buf)c=CRC_TABLE[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function chunk(type,payload){
  const kind=Buffer.from(type,'ascii'),h=Buffer.alloc(8);
  h.writeUInt32BE(payload.length,0);kind.copy(h,4);
  const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(Buffer.concat([kind,payload])));
  return Buffer.concat([h,payload,checksum]);
}
export function decodeRgbaPng(buf){
  if(!buf.subarray(0,8).equals(SIG))throw Error('PNG signature invalid');
  let off=8,width=0,height=0,idat=[],ended=false,seenIHDR=false;
  while(off<buf.length){
    if(off+12>buf.length)throw Error('PNG chunk truncated');
    const size=buf.readUInt32BE(off),end=off+12+size;
    if(end>buf.length)throw Error('PNG chunk payload truncated');
    const kind=buf.toString('ascii',off+4,off+8),data=buf.subarray(off+8,off+8+size);
    if(crc32(buf.subarray(off+4,off+8+size))!==buf.readUInt32BE(off+8+size))
      throw Error('PNG CRC mismatch: '+kind);
    if(kind==='IHDR'){
      if(seenIHDR||size!==13||off!==8)throw Error('Invalid PNG IHDR');
      seenIHDR=true;width=data.readUInt32BE(0);height=data.readUInt32BE(4);
      if(!width||!height||width>1024||height>1024||data[8]!==8||data[9]!==6||data[10]!==0||data[11]!==0||data[12]!==0)
        throw Error('Unsupported PNG format; expected 8-bit RGBA, noninterlaced');
    }else if(kind==='IDAT')idat.push(data);
    else if(kind==='IEND'){if(size!==0||end!==buf.length)throw Error('PNG IEND invalid');ended=true;break}
    else if((kind.charCodeAt(0)&32)===0)throw Error('Unsupported critical PNG chunk '+kind);
    off=end;
  }
  if(!seenIHDR||!ended||!idat.length)throw Error('PNG lacks required chunks');
  const raw=inflateSync(Buffer.concat(idat)),stride=width*4;
  if(raw.length!==(stride+1)*height)throw Error('PNG expanded size mismatch');
  const pixels=Buffer.alloc(width*height*4);let p=0;
  for(let y=0;y<height;y++){
    const filter=raw[p++];if(filter>4)throw Error('PNG invalid filter');
    for(let x=0;x<stride;x++){
      const left=x>=4?pixels[y*stride+x-4]:0,above=y?pixels[(y-1)*stride+x]:0;
      const corner=y&&x>=4?pixels[(y-1)*stride+x-4]:0;
      let predictor=0;
      if(filter===1)predictor=left;
      else if(filter===2)predictor=above;
      else if(filter===3)predictor=(left+above)>>1;
      else if(filter===4){
        const a=Math.abs(above-corner),b=Math.abs(left-corner),c=Math.abs(left+above-2*corner);
        predictor=(a<=b&&a<=c)?left:(b<=c?above:corner);
      }
      pixels[y*stride+x]=(raw[p++]+predictor)&255;
    }
  }
  return {width,height,pixels};
}
function encodeRgbaPng({width,height,pixels}){
  const rowBytes=width*4,raw=Buffer.alloc((rowBytes+1)*height);
  for(let y=0;y<height;y++)pixels.copy(raw,y*(rowBytes+1)+1,y*rowBytes,(y+1)*rowBytes);
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return Buffer.concat([SIG,chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function resize(source,size){
  const {width,height,pixels}=source,result=Buffer.alloc(size*size*4);
  const sample=(x,y,k)=>pixels[4*(y*width+x)+k];
  for(let oy=0;oy<size;oy++)for(let ox=0;ox<size;ox++){
    const x=Math.max(0,Math.min(width-1,(ox+0.5)*width/size-0.5));
    const y=Math.max(0,Math.min(height-1,(oy+0.5)*height/size-0.5));
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),dx=x-x0,dy=y-y0;
    const weights=[(1-dx)*(1-dy),dx*(1-dy),(1-dx)*dy,dx*dy],xy=[[x0,y0],[x1,y0],[x0,y1],[x1,y1]];
    let alpha=0;for(let i=0;i<4;i++)alpha+=weights[i]*sample(...xy[i],3);
    const off=4*(oy*size+ox);result[off+3]=Math.round(alpha);
    for(let k=0;k<3;k++){
      let c=0;for(let i=0;i<4;i++)c+=weights[i]*sample(...xy[i],k)*sample(...xy[i],3);
      result[off+k]=alpha?Math.round(c/alpha):0;
    }
  }
  return {width:size,height:size,pixels:result};
}
export async function rebuildPwaIcons(outputDir,svgPath){
  const svg=await readFile(svgPath,'utf8');
  const matches=[...svg.matchAll(/<image\b[^>]*\bhref="data:image\/png;base64,([A-Za-z0-9+/=\s]+)"/g)];
  if(matches.length!==1)throw Error('Expected exactly one embedded source-owned PNG artwork in favicon.svg');
  const bytes=Buffer.from(matches[0][1].replace(/\s/g,''),'base64'),source=decodeRgbaPng(bytes);
  if(source.width!==300||source.height!==300)throw Error('Unexpected favicon source-artwork dimensions');
  for(const size of [192,512]){
    const png=encodeRgbaPng(resize(source,size)),decoded=decodeRgbaPng(png);
    if(decoded.width!==size||decoded.height!==size)throw Error('PWA icon validation failed');
    await writeFile(join(outputDir,'icon-'+size+'.png'),png);
  }
}
