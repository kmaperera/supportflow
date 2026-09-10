const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateCsv, buildCsvFilename, sendCsvDownload } = require('../src/utils/csv');

test('CSV explicit columns escape text and map nested values without leaking other fields', () => {
  const csv = generateCsv({columns:[{key:'title',header:'Title'},{header:'Name',value:r=>r.user.name}],rows:[{title:'Printer, "Floor 2"\r\nOffline',user:{name:'සිංහල 日本語'},password:'secret'}]});
  assert.equal(csv,'\uFEFF"Title","Name"\r\n"Printer, ""Floor 2""\r\nOffline","සිංහල 日本語"\r\n');
  assert.ok(!csv.includes('secret'));
  assert.equal(generateCsv({columns:[{key:'x',header:'X'}],rows:[]}), '\uFEFF"X"\r\n');
});
test('CSV scalar types, UTC dates, and formula protection preserve source values', () => {
  const values=[null,undefined,true,false,1250.5,-10,new Date('2026-09-10T05:30:00Z'),'=1+1','+SUM(A1)','-10','@name','  =1','\t=1','normal'];
  const rows=values.map(value=>({value}));
  const csv=generateCsv({columns:[{key:'value',header:'Value'}],rows});
  assert.equal(csv,'\uFEFF"Value"\r\n""\r\n""\r\n"true"\r\n"false"\r\n"1250.5"\r\n"-10"\r\n"2026-09-10T05:30:00.000Z"\r\n"\'=1+1"\r\n"\'+SUM(A1)"\r\n"\'-10"\r\n"\'@name"\r\n"\'  =1"\r\n"\'\t=1"\r\n"normal"\r\n');
  assert.equal(rows[7].value,'=1+1');
  for(const value of [{},[],NaN,Infinity,new Date('invalid')]) assert.throws(()=>generateCsv({columns:[{key:'value',header:'Value'}],rows:[{value}]}),TypeError);
  for(const columns of [[],[{}],[{key:'x'}],[{header:'X',value:'bad'}],[{header:'X'}]]) assert.throws(()=>generateCsv({columns,rows:[]}),TypeError);
});
test('CSV filenames are safe and dates use UTC', () => {
  assert.equal(buildCsvFilename('SupportFlow-Tickets',new Date('2026-09-10T01:00:00+05:30')),'supportflow-tickets-2026-09-09.csv');
  for(const value of ['../tickets','a/b','a\\b','a\r\nX: injected','"bad"','a.csv','']) assert.throws(()=>buildCsvFilename(value),TypeError);
  for(const filename of ['../x.csv','a\r\n.csv','a".csv','a\\b.csv']) assert.throws(()=>sendCsvDownload({}, {csv:'x',filename}),TypeError);
});
test('CSV response sends UTF-8 bytes with safe attachment headers', async t => {
  const app=require('express')();
  const csv=generateCsv({columns:[{key:'text',header:'Text'}],rows:[{text:'日本語'}]});
  app.get('/',(req,res)=>sendCsvDownload(res,{csv,filename:buildCsvFilename('supportflow-test',new Date('2026-09-10Z'))}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'text/csv; charset=utf-8');
  assert.equal(response.headers.get('content-disposition'),'attachment; filename="supportflow-test-2026-09-10.csv"');
  assert.equal(Number(response.headers.get('content-length')),Buffer.byteLength(csv));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(csv));
});
