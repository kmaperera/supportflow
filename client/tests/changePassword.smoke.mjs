import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server=await createServer({server:{middlewareMode:true},appType:'custom'})
try {
 const {validatePasswordChange}=await server.ssrLoadModule('/src/auth/passwordValidation.js')
 const valid={currentPassword:'OldPass1',newPassword:'NewPass2',confirmPassword:'NewPass2'}
 assert.deepEqual(validatePasswordChange(valid),{})
 assert.equal(Object.keys(validatePasswordChange({currentPassword:'',newPassword:'',confirmPassword:''})).length,3)
 for(const newPassword of ['short','lowercase1','UPPERCASE1','NoDigitsHere','OldPass1'])assert.ok(validatePasswordChange({...valid,newPassword,confirmPassword:newPassword}).newPassword)
 assert.ok(validatePasswordChange({...valid,confirmPassword:'Different1'}).confirmPassword)
 const {default:api}=await server.ssrLoadModule('/src/api/axios.js')
 const {changePassword,getPasswordChangeErrorMessage}=await server.ssrLoadModule('/src/api/authApi.js')
 const {setAccessToken,clearAccessToken}=await server.ssrLoadModule('/src/auth/accessToken.js')
 setAccessToken('test-access')
 api.defaults.adapter=async config=>{
  assert.equal(config.url,'/auth/change-password');assert.equal(config.method,'patch');assert.deepEqual(JSON.parse(config.data),valid)
  assert.equal(config.headers.get('Authorization'),'Bearer test-access');assert.equal(config.withCredentials,true)
  return {config,data:{success:true,message:'Password changed successfully. Please log in again.'},status:200,statusText:'OK',headers:{}}
 }
 assert.equal((await changePassword({...valid,userId:99})).success,true)
 assert.equal(getPasswordChangeErrorMessage({response:{status:400,data:{success:false,message:'Current password is incorrect'}}}),'Current password is incorrect')
 assert.equal(getPasswordChangeErrorMessage({isAxiosError:true}),'Unable to connect to the server. Please try again.')
 assert.equal(getPasswordChangeErrorMessage({response:{status:500,data:{message:'SQL secret'}}}),'Unable to change your password. Please try again.')
 clearAccessToken()
 console.log('Password rules, authenticated PATCH contract, confirmation field and safe errors passed; no live requests sent.')
}finally{await server.close()}
