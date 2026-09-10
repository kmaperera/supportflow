import assert from 'node:assert/strict'
import React from 'react'
import {renderToString} from 'react-dom/server'
import {MemoryRouter, Navigate, Outlet} from 'react-router-dom'
import {createServer} from 'vite'
const server=await createServer({server:{middlewareMode:true},appType:'custom'})
try {
 const {AuthContext}=await server.ssrLoadModule('/src/auth/AuthContext.js')
 const {default:AppRoutes}=await server.ssrLoadModule('/src/routes/AppRoutes.jsx')
 const {default:RoleRoute}=await server.ssrLoadModule('/src/routes/RoleRoute.jsx')
 const {default:RoleHomeRedirect}=await server.ssrLoadModule('/src/routes/RoleHomeRedirect.jsx')
 const {default:LoginRoute}=await server.ssrLoadModule('/src/routes/LoginRoute.jsx')
 const {default:SessionLoading}=await server.ssrLoadModule('/src/routes/SessionLoading.jsx')
 const render=(state,element,path='/')=>renderToString(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(AuthContext.Provider,{value:state},element)))
 for(const role of ['EMPLOYEE','TECHNICIAN','ADMIN']){
  const state={isInitializing:false,isAuthenticated:true,user:{role,mustChangePassword:true}}
  const home='/'+role.toLowerCase()
  assert.match(render(state,React.createElement(AppRoutes),home),/Dashboard/)
  assert.match(render(state,React.createElement(AppRoutes),home+'/dashboard'),/Dashboard/)
  function Probe(){
   assert.equal(RoleHomeRedirect().type,Navigate);assert.equal(RoleHomeRedirect().props.to,home)
   assert.equal(LoginRoute().type,RoleHomeRedirect)
   for(const required of ['EMPLOYEE','TECHNICIAN','ADMIN'])assert.equal(RoleRoute({role:required}).type,required===role?Outlet:RoleHomeRedirect)
   return null
  }
  render(state,React.createElement(Probe))
 }
 function Waiting(){assert.equal(RoleHomeRedirect().type,SessionLoading);assert.equal(LoginRoute().type,SessionLoading);return null}
 render({isInitializing:true,isAuthenticated:false},React.createElement(Waiting))
 function LoggedOut(){assert.equal(RoleHomeRedirect().props.to,'/login');assert.equal(LoginRoute().type,Outlet);return null}
 render({isInitializing:false,isAuthenticated:false},React.createElement(LoggedOut))
 assert.match(render({isInitializing:false,isAuthenticated:true,user:{role:'UNKNOWN'}},React.createElement(RoleHomeRedirect)),/Access unavailable/)
 assert.match(render({isInitializing:false,isAuthenticated:false},React.createElement(AppRoutes),'/not-real'),/Not Found/)
 console.log('Role matrix, root/login destinations, initialization, unknown-role fallback and 404 checks passed.')
}finally{await server.close()}
