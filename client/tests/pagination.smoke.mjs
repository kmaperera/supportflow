import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import {visiblePages, paginationValues} from '../src/components/paginationModel.js'
assert.deepEqual(visiblePages(1,1),[1])
assert.deepEqual(visiblePages(2,5),[1,2,3,4,5])
assert.deepEqual(visiblePages(1,100),[1,2,3,4,'…',100])
assert.deepEqual(visiblePages(50,100),[1,'…',49,50,51,'…',100])
assert.deepEqual(visiblePages(100,100),[1,'…',97,98,99,100])
for(let total=1;total<150;total++)for(let page=1;page<=total;page++){
 const values=visiblePages(page,total)
 assert.ok(values.length<=7 && values.includes(page))
}
const expected={currentPage:2,totalPages:3,totalItems:25,pageSize:10}
for(const metadata of [{currentPage:2,totalPages:3,totalRecords:25,limit:10},{page:2,totalPages:3,total:25,limit:10},{page:2,totalPages:3,totalItems:25,limit:10}])assert.deepEqual(paginationValues(metadata),expected)
const server=await createServer({server:{middlewareMode:true},appType:'custom'})
try{
 const {default:Pagination}=await server.ssrLoadModule('/src/components/Pagination.jsx')
 const render=(page,total=25,loading=false)=>renderToStaticMarkup(React.createElement(Pagination,{metadata:{page,limit:10,total,totalPages:Math.ceil(total/10)},isLoading:loading,onPageChange(){}}))
 assert.match(render(3),/Showing 21–25 of 25/)
 assert.match(render(2),/aria-current="page"/)
 assert.equal(render(1,0),'')
 assert.equal(render(4),'')
 assert.match(render(2,25,true),/aria-busy="true"/)
 assert.match(render(1),/disabled="">Previous/)
 assert.match(render(3),/disabled="">Next/)
 console.log('Three API shapes, compact page windows, safe ranges, zero/invalid pages, boundary controls and fetching semantics passed.')
}finally{await server.close()}
