import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { normalizeTheme } from '../src/theme/theme.js'
const script = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8')
for (const saved of [null, 'light', 'dark', 'system', 'invalid']) {
 for (const systemDark of [false,true]) {
  for (const blocked of [false,true]) {
   let applied
   const root={classList:{toggle:(name,value)=>{assert.equal(name,'dark');applied=value}},style:{}}
   runInNewContext(script,{document:{documentElement:root},window:{matchMedia:()=>({matches:systemDark})},localStorage:{getItem:key=>{assert.equal(key,'supportflow-theme');if(blocked)throw Error('blocked');return saved}}})
   const preference=blocked?'light':normalizeTheme(saved)
   const expected=preference==='dark'
   assert.equal(applied,expected)
   assert.equal(root.style.colorScheme,expected?'dark':'light')
  }
 }
}
assert.equal(normalizeTheme({}),'light')
console.log('PASS: startup Light/Dark, legacy/absent/invalid storage, blocked storage and OS-independent color-scheme.')
