import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync('lib/pricing-economics.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS
}}).outputText;
const api={};
vm.runInNewContext(compiled,{exports:api});
const near=(a,b,tolerance=0.015)=>assert.ok(Math.abs(a-b)<=tolerance,
  'Expected '+a+' to equal approximately '+b);

test('market math treats PNW license holders as non-unique proxies, not guaranteed app TAM',()=>{
 const m=api.marketFunnel(api.BASE_PNW_MARKET);
 assert.equal(m.licenseHoldersSum,1276096);
 assert.equal(m.assumedOverlap,60109);
 assert.equal(m.licenseHolderProxy,1215987);
 assert.equal(m.frequentAnglerProxy,389115);
 assert.equal(m.estimatedReachableAudience,7782);
 assert.equal(m.expectedAnnualSubscribers,233);
 assert.ok(m.expectedAnnualSubscribers<m.estimatedReachableAudience);
});

test('zero market or zero conversion produces zero subscribers and a negative-cost downside',()=>{
 const costs=api.BASE_PWA_COSTS;
 for(const m of [
   {...api.BASE_PNW_MARKET,oregonLicenseHolders:0,washingtonLicenseHolders:0},
   {...api.BASE_PNW_MARKET,paidConversion:0},
   {...api.BASE_PNW_MARKET,reachableShare:0},
 ]){
  const f=api.marketFunnel(m);
  assert.equal(f.expectedAnnualSubscribers,0);
  const financial=api.annualFinancials(29.99,costs,f.expectedAnnualSubscribers);
  assert.equal(financial.grossCashCollected,0);
  assert.equal(financial.marginAfterModeledCosts,null);
  assert.ok(financial.cashAfterModeledCosts<0);
 }
});

test('annual price comparison accounts for fixed card fee and Stripe Billing, not free processing',()=>{
 const cost=api.BASE_PWA_COSTS;
 const scenarios=api.ANNUAL_PRICE_OPTIONS;
 assert.deepEqual(Array.from(scenarios),[9.99,19.99,29.99,39.99,49.99]);
 const p10=api.annualFinancials(9.99,cost,1);
 const p30=api.annualFinancials(29.99,cost,1);
 near(p10.cardAndBillingFees,9.99*.036+.30);
 near(p30.cardAndBillingFees,29.99*.036+.30);
 near(p10.contributionPerSubscriber,9.99*.964-.30-1.50);
 near(p30.contributionPerSubscriber,29.99*.964-.30-1.50);
 assert.ok(p30.contributionPerSubscriber>p10.contributionPerSubscriber*3);
 assert.equal(p30.infrastructureAnnual,540);
 assert.equal(p30.marketingAnnual,1800);
 assert.equal(p30.founderLaborAnnual,720);
 assert.equal(p30.breakEvenSubscribers,113);
 assert.equal(api.annualFinancials(19.99,cost,0).breakEvenSubscribers,176);
});

test('price conversion sensitivity reveals how many buyers the higher price must retain',()=>{
 const threshold=api.higherPriceBuyerRetentionThreshold(
   19.99,29.99,api.BASE_PWA_COSTS);
 near(threshold,(19.99*.964-1.8)/(29.99*.964-1.8),0.00001);
 assert.ok(threshold>0.6&&threshold<0.7);
 const from999=api.higherPriceBuyerRetentionThreshold(9.99,29.99,api.BASE_PWA_COSTS);
 assert.ok(from999<.3);
 assert.throws(()=>api.higherPriceBuyerRetentionThreshold(29.99,19.99,api.BASE_PWA_COSTS),
               /Higher price/);
});

test('downside is actually unprofitable; base and upside are assumptions not forecasts',()=>{
 const down=api.evaluateAllPrices(api.SCENARIOS[0]);
 const base=api.evaluateAllPrices(api.SCENARIOS[1]);
 const up=api.evaluateAllPrices(api.SCENARIOS[2]);
 assert.equal(down.scenario,'downside');
 assert.equal(down.market.expectedAnnualSubscribers,3);
 assert.ok(down.options.every(o=>o.cashAfterModeledCosts<0));
 assert.equal(base.market.expectedAnnualSubscribers,233);
 const at30=base.options.find(o=>o.annualPrice===29.99);
 assert.ok(at30.cashAfterModeledCosts>0);
 assert.ok(at30.cashAfterModeledCosts<4000);
 assert.equal(up.market.expectedAnnualSubscribers,1246);
 assert.ok(up.options.find(o=>o.annualPrice===29.99).cashAfterModeledCosts>0);
});

test('renewal-year retention is separate from new subscriber assumptions',()=>{
 const c=api.BASE_PWA_COSTS;
 const r=api.annualFinancials(29.99,c,20,100,0.65);
 assert.equal(r.newSubscribers,20);
 assert.equal(r.retainedSubscribers,65);
 assert.equal(r.paidTransactions,85);
 near(r.grossCashCollected,85*29.99);
 const noRenewals=api.annualFinancials(29.99,c,20,100,0);
 assert.equal(noRenewals.retainedSubscribers,0);
 assert.ok(noRenewals.cashAfterModeledCosts<r.cashAfterModeledCosts);
});

test('native app distribution fees can change break-even without changing product price',()=>{
 const pwa=api.BASE_PWA_COSTS;
 const app={...pwa,platformPercent:.15};
 const pwaFinancial=api.annualFinancials(29.99,pwa,300);
 const appFinancial=api.annualFinancials(29.99,app,300);
 near(pwaFinancial.appStoreFees,0);
 near(appFinancial.appStoreFees,300*29.99*.15);
 assert.ok(appFinancial.breakEvenSubscribers>pwaFinancial.breakEvenSubscribers);
 assert.ok(appFinancial.cashAfterModeledCosts<pwaFinancial.cashAfterModeledCosts);
});

test('bad market assumptions, fees, prices and subscriber counts fail closed',()=>{
 const market=api.BASE_PNW_MARKET;
 for(const change of [
  {paidConversion:1.2},{paidConversion:-.01},{reachableShare:Infinity},
  {duplicateShareOfSmallerState:-.1},{oregonLicenseHolders:-100},
  {washingtonLicenseHolders:12.5},{frequentAnglerShare:NaN},
 ]){
  assert.throws(()=>api.marketFunnel({...market,...change}),/nonnegative|proportion|integer/);
 }
 const costs=api.BASE_PWA_COSTS;
 for(const price of [0,-1,Infinity,NaN]){
  assert.throws(()=>api.annualFinancials(price,costs,10),/Annual|nonnegative/);
 }
 assert.throws(()=>api.annualFinancials(29.99,costs,-1),/nonnegative/);
 assert.throws(()=>api.annualFinancials(29.99,costs,10.5),/integer/);
 assert.throws(()=>api.annualFinancials(29.99,costs,1,10,1.2),/proportion/);
 assert.throws(()=>api.annualFinancials(29.99,{...costs,platformPercent:.98},10),
               /Total percentage fees/);
});

test('business metrics are offline development only and cannot bill or expose private data',()=>{
 assert.doesNotMatch(source,/fetch\(|navigator\.|window\.|document\.cookie|localStorage|from\(['"]stripe|createCheckout|\.insert\(|sendEmail/);
 const readme=readFileSync('docs/ANGLER_PLUS_PRICING_RESEARCH.md','utf8');
 for(const s of ['57 million','license-holder proxy','conversion','not deployed',
                 'founder labor','no phone calls','renewal','payment processing']){
   assert.match(readme,new RegExp(s,'i'),s);
 }
});
