const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generatePdfReport,buildPdfFilename,sendPdfDownload}=require('../src/utils/pdf');
const columns=[{header:'Name',key:'name',width:160},{header:'Value',value:r=>r.value}];
test('PDF buffers support both A4 layouts, wrapped multipage rows and empty tables',async()=>{
 for(const orientation of ['portrait','landscape']){
  const pdf=await generatePdfReport({title:'SupportFlow Test',subtitle:'Plain text <script>no execution</script>',columns,orientation,rows:Array.from({length:100},(_,i)=>({name:'Long wrapped name '.repeat(4),value:i})),generatedAt:new Date('2026-09-10Z')});
  assert.ok(Buffer.isBuffer(pdf));assert.ok(pdf.toString('ascii',0,8).startsWith('%PDF-'));
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>1);
 }
 const empty=await generatePdfReport({title:'Empty',columns,rows:[]});assert.ok(empty.length>500);
 const scalars=await generatePdfReport({title:'Types',columns,rows:[null,undefined,true,false,-4,new Date('2026-09-10Z'),'=formula'].map(value=>({name:'Text',value}))});assert.ok(scalars.length>500);
});
test('PDF rejects invalid definitions, mapping failures and oversized rows without hanging',async()=>{
 for(const options of [{columns:[]},{orientation:'sideways'},{columns:[{header:'X',value:5}]},{columns:[{header:'X',key:'x',width:1000}]},{rows:[{value:{}}]},{rows:[{value:new Date('invalid')}]},{rows:[{name:'word '.repeat(20000)}]},{columns:[{header:'X',value:()=>{throw new Error('mapper failure');}}],rows:[{}]}]) await assert.rejects(generatePdfReport({title:'Test',columns,rows:[],...options}));
});
test('PDF filenames and raw HTTP payload are safe',async t=>{
 assert.equal(buildPdfFilename('SupportFlow-Test',new Date('2026-09-10T01:00:00+05:30')),'supportflow-test-2026-09-09.pdf');
 for(const name of ['../x','a/b','a\\b','x\r\nHeader','"x"'])assert.throws(()=>buildPdfFilename(name));
 assert.throws(()=>sendPdfDownload({}, {pdfBuffer:Buffer.from('x'),filename:'x\r\n.pdf'}));
 const pdfBuffer=await generatePdfReport({title:'Download',columns,rows:[]});
 const app=require('express')();app.get('/',(req,res)=>sendPdfDownload(res,{pdfBuffer,filename:buildPdfFilename('supportflow-test')}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const response=await fetch(`http://127.0.0.1:${server.address().port}/`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.equal(Number(response.headers.get('content-length')),pdfBuffer.length);assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdfBuffer);
});

test('PDF stream errors reject the generation promise',async t=>{
 const PDFDocument=require('pdfkit');
 t.mock.method(PDFDocument.prototype,'end',function(){this.destroy(new Error('stream failure'));});
 await assert.rejects(generatePdfReport({title:'Stream test',columns,rows:[]}),/stream failure/);
});

test('PDF sections repeat their own headers across pages and preserve section order',async t=>{
 const PDFDocument=require('pdfkit');const original=PDFDocument.prototype.text;const texts=[];
 t.mock.method(PDFDocument.prototype,'text',function(text,...args){texts.push(String(text));return original.call(this,text,...args);});
 const pdf=await generatePdfReport({title:'Sections',sections:[{title:'First',columns:[{header:'First Header',key:'x'}],rows:Array.from({length:90},()=>({x:'row'}))},{title:'Second',columns:[{header:'Second Header',key:'x'}],rows:[]}]});
 assert.ok(pdf.length>500);assert.ok(texts.filter(x=>x==='First Header').length>1);assert.equal(texts.filter(x=>x==='Second Header').length,1);assert.ok(texts.lastIndexOf('First Header')<texts.indexOf('Second'));
 await assert.rejects(generatePdfReport({title:'Invalid',sections:[]}));
});
