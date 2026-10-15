// Native MySQL connections: commit only a generated fixture, clean exact IDs.
require('dotenv').config({quiet:true});
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),pool=require('../src/config/database');
let userId,stage='setup';const email='reset-race-'+randomUUID()+'@example.test',messages=[];
(async()=>{try{
assert.notEqual(process.env.NODE_ENV,'production');assert.ok(['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST));
const password=require('../src/utils/password'),hash=await password.hashPassword('OldRaceFixture123!');
const [row]=await pool.execute("INSERT INTO users(first_name,last_name,email,password_hash,role,is_active,must_change_password) VALUES('Reset race','Owned fixture',?,?,'EMPLOYEE',1,1)",[email,hash]);userId=row.insertId;
require('../src/services/email.service').sendEmail=async message=>messages.push(message);
const service=require('../src/modules/auth/passwordReset.service');await service.sendInstructions(userId,{});const token=new URL(messages[0].text.match(/http[^\s]+/)[0]).searchParams.get('token');const newPassword='NewRaceFixture456!';
stage='concurrent reset';const result=await Promise.allSettled([service.resetPassword(token,newPassword),service.resetPassword(token,newPassword)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.statusCode,400);
const [users]=await pool.execute('SELECT password_hash,must_change_password FROM users WHERE id=?',[userId]);assert.ok(await password.comparePassword(newPassword,users[0].password_hash));assert.equal(users[0].must_change_password,0);const [tokens]=await pool.execute('SELECT token_hash,used_at FROM password_reset_tokens WHERE user_id=?',[userId]);assert.equal(tokens[0].token_hash,createHash('sha256').update(token).digest('hex'));assert.ok(tokens[0].used_at);const [audit]=await pool.execute("SELECT COUNT(*) n FROM audit_logs WHERE actor_user_id=? AND action='PASSWORD_RESET_COMPLETED'",[userId]);assert.equal(Number(audit[0].n),1);
console.log('PASS: native concurrent reset has one winner/one controlled rejection; password, token consumption and audit commit atomically.');
}catch(e){console.error(JSON.stringify({stage,name:e.name,code:e.code}));process.exitCode=1}finally{if(userId){await pool.execute('DELETE FROM audit_logs WHERE actor_user_id=?',[userId]);await pool.execute('DELETE FROM users WHERE id=? AND email=?',[userId,email]);const [left]=await pool.execute('SELECT COUNT(*) n FROM password_reset_tokens WHERE user_id=?',[userId]);assert.equal(Number(left[0].n),0)}await pool.end()}})();
