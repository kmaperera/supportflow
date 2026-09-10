import assert from 'node:assert/strict'
import React from 'react'
import {renderToString} from 'react-dom/server'
import {MemoryRouter, Navigate, Outlet} from 'react-router-dom'
import {createServer} from 'vite'
const server=await createServer({server:{middlewareMode:true},appType:'custom'})
try {
 const load=path=>server.ssrLoadModule(path)
 const {AuthContext}=await load('/src/auth/AuthContext.js')
 const {default:AppRoutes}=await load('/src/routes/AppRoutes.jsx')
 const {default:RoleRoute}=await load('/src/routes/RoleRoute.jsx')
 const {default:RoleHomeRedirect}=await load('/src/routes/RoleHomeRedirect.jsx')
 const {default:ChangePasswordRoute}=await load('/src/routes/ChangePasswordRoute.jsx')
 const {default:ProtectedRoute}=await load('/src/routes/ProtectedRoute.jsx')
 const {default:LoginRoute}=await load('/src/routes/LoginRoute.jsx')
 const {default:SessionLoading}=await load('/src/routes/SessionLoading.jsx')
 const render=(state,element,path='/change-password')=>renderToString(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(AuthContext.Provider,{value:state},element)))
 for(const role of ['EMPLOYEE','TECHNICIAN','ADMIN']) for(const required of [true,false]) {
  const user=Object.freeze({role,mustChangePassword:required})
  const state={isInitializing:false,isAuthenticated:true,user}
  function Probe(){
   assert.equal(RoleHomeRedirect().props.to,required?'/change-password':'/'+role.toLowerCase())
   assert.equal(LoginRoute().type,RoleHomeRedirect)
   assert.equal(ChangePasswordRoute().type,required?Outlet:RoleHomeRedirect)
   for(const area of ['EMPLOYEE','TECHNICIAN','ADMIN'])assert.equal(RoleRoute({role:area}).type,required||role!==area?RoleHomeRedirect:Outlet)
   return null
  }
  render(state,React.createElement(Probe))
  if(required){const html=render(state,React.createElement(AppRoutes));assert.match(html,/Password change required/);assert.ok(!/<input|<form|<a |<button/.test(html))}
  assert.equal(user.mustChangePassword,required)
 }
 function Pending(){assert.equal(ProtectedRoute().type,SessionLoading);assert.equal(RoleHomeRedirect().type,SessionLoading);return null}
 render({isInitializing:true,isAuthenticated:false},React.createElement(Pending))
 function LoggedOut(){assert.equal(ProtectedRoute().type,Navigate);assert.equal(ProtectedRoute().props.to,'/login');return null}
 render({isInitializing:false,isAuthenticated:false},React.createElement(LoggedOut))
 assert.match(render({isInitializing:false,isAuthenticated:true,user:{role:'UNKNOWN',mustChangePassword:true}},React.createElement(AppRoutes)),/Access unavailable/)
 console.log('Forced-password role matrix, destinations, initialization, protected placeholder and immutable flag checks passed.')
}finally{await server.close()}
