/**
 * RateMyGuidePNW pricing scenarios. PURE / OFFLINE / NOT A PAYWALL.
 *
 * PNW angler-holder counts are directional proxies, NOT registered app users,
 * consenting adults, or verified individual fishing customers. Overlap,
 * frequency, organic reach, and subscription conversion are hypothetical.
 *
 * Prices are illustrative annual PWA cash collections (not accrual profit).
 * No Stripe, app-store, customer tracking, billing or contact functionality.
 */
export const ANNUAL_PRICE_OPTIONS=[9.99,19.99,29.99,39.99,49.99] as const;
export type AnnualPrice=(typeof ANNUAL_PRICE_OPTIONS)[number];

export type MarketAssumptions={
  oregonLicenseHolders:number;
  washingtonLicenseHolders:number;
  /** Fraction of smaller license-holder population potentially double-counted. Proxy only. */
  duplicateShareOfSmallerState:number;
  /** Proxy for licensed people fishing monthly+, extrapolated from national report. */
  frequentAnglerShare:number;
  /** Fraction of proxy active holders actually reached by this specific product/year. */
  reachableShare:number;
  /** Fraction of the reached eligible audience choosing annual purchase. */
  paidConversion:number;
};

export type AnnualCostAssumptions={
  hostingPerMonth:number;
  databasePerMonth:number;
  otherFixedPerMonth:number;
  marketingPerMonth:number;
  founderHoursPerMonth:number;
  valueOfFounderHour:number;
  cardPercent:number;
  billingPercent:number;
  cardFixedPerTransaction:number;
  subscriberVariablePerYear:number;
  /** Optional extra platform percentage: e.g. native app-store fee, set to zero for PWA. */
  platformPercent:number;
};

export type MarketFunnel={
  licenseHoldersSum:number;
  assumedOverlap:number;
  licenseHolderProxy:number;
  frequentAnglerProxy:number;
  estimatedReachableAudience:number;
  expectedAnnualSubscribers:number;
};
export type AnnualFinancials={
  annualPrice:number;
  newSubscribers:number;
  retainedSubscribers:number;
  paidTransactions:number;
  grossCashCollected:number;
  cardAndBillingFees:number;
  appStoreFees:number;
  subscriberVariableCosts:number;
  infrastructureAnnual:number;
  marketingAnnual:number;
  founderLaborAnnual:number;
  cashAfterModeledCosts:number;
  marginAfterModeledCosts:number|null;
  breakEvenSubscribers:number|null;
  contributionPerSubscriber:number;
};

function finiteNonnegative(v:number,name:string):void{
  if(!Number.isFinite(v)||v<0)
    throw new Error(name+' must be a finite nonnegative number.');
}
function ratio(v:number,name:string):void{
  finiteNonnegative(v,name);
  if(v>1)throw new Error(name+' must be a proportion between 0 and 1.');
}
function count(v:number,name:string):void{
  finiteNonnegative(v,name);
  if(!Number.isInteger(v))throw new Error(name+' must be an integer.');
}
function validateCosts(c:AnnualCostAssumptions):void{
  for(const name of ['hostingPerMonth','databasePerMonth','otherFixedPerMonth',
    'marketingPerMonth','founderHoursPerMonth','valueOfFounderHour',
    'cardFixedPerTransaction','subscriberVariablePerYear'] as const)
    finiteNonnegative(c[name],name);
  for(const name of ['cardPercent','billingPercent','platformPercent'] as const)
    ratio(c[name],name);
  if(c.cardPercent+c.billingPercent+c.platformPercent>1)
    throw new Error('Total percentage fees cannot exceed 100%.');
}
export function priceContribution(price:number,c:AnnualCostAssumptions):number{
  finiteNonnegative(price,'annualPrice');
  validateCosts(c);
  if(price===0)throw new Error('Annual subscription price must be greater than zero.');
  return price*(1-c.cardPercent-c.billingPercent-c.platformPercent)-
    c.cardFixedPerTransaction-c.subscriberVariablePerYear;
}
export function marketFunnel(m:MarketAssumptions):MarketFunnel{
  count(m.oregonLicenseHolders,'oregonLicenseHolders');
  count(m.washingtonLicenseHolders,'washingtonLicenseHolders');
  ratio(m.duplicateShareOfSmallerState,'duplicateShareOfSmallerState');
  ratio(m.frequentAnglerShare,'frequentAnglerShare');
  ratio(m.reachableShare,'reachableShare');
  ratio(m.paidConversion,'paidConversion');
  const licenseHoldersSum=m.oregonLicenseHolders+m.washingtonLicenseHolders;
  const assumedOverlap=Math.floor(Math.min(m.oregonLicenseHolders,
    m.washingtonLicenseHolders)*m.duplicateShareOfSmallerState);
  const licenseHolderProxy=licenseHoldersSum-assumedOverlap;
  const frequentAnglerProxy=Math.floor(licenseHolderProxy*m.frequentAnglerShare);
  const estimatedReachableAudience=Math.floor(frequentAnglerProxy*m.reachableShare);
  return{
    licenseHoldersSum,assumedOverlap,licenseHolderProxy,
    frequentAnglerProxy,estimatedReachableAudience,
    expectedAnnualSubscribers:Math.floor(estimatedReachableAudience*m.paidConversion),
  };
}
export function annualFinancials(
  price:number,c:AnnualCostAssumptions,newSubscribers:number,
  priorYearSubscribers=0,renewalRate=0
):AnnualFinancials{
  count(newSubscribers,'newSubscribers');
  count(priorYearSubscribers,'priorYearSubscribers');
  ratio(renewalRate,'renewalRate');
  const contributionPerSubscriber=priceContribution(price,c);
  const retainedSubscribers=Math.floor(priorYearSubscribers*renewalRate);
  const paidTransactions=newSubscribers+retainedSubscribers;
  const grossCashCollected=price*paidTransactions;
  const cardAndBillingFees=grossCashCollected*(c.cardPercent+c.billingPercent)+
    paidTransactions*c.cardFixedPerTransaction;
  const appStoreFees=grossCashCollected*c.platformPercent;
  const subscriberVariableCosts=paidTransactions*c.subscriberVariablePerYear;
  const infrastructureAnnual=12*(c.hostingPerMonth+c.databasePerMonth+c.otherFixedPerMonth);
  const marketingAnnual=12*c.marketingPerMonth;
  const founderLaborAnnual=12*c.founderHoursPerMonth*c.valueOfFounderHour;
  const fixed=infrastructureAnnual+marketingAnnual+founderLaborAnnual;
  const cashAfterModeledCosts=grossCashCollected-cardAndBillingFees-
    appStoreFees-subscriberVariableCosts-fixed;
  return{
    annualPrice:price,newSubscribers,retainedSubscribers,paidTransactions,
    grossCashCollected,cardAndBillingFees,appStoreFees,subscriberVariableCosts,
    infrastructureAnnual,marketingAnnual,founderLaborAnnual,
    cashAfterModeledCosts,
    marginAfterModeledCosts:grossCashCollected>0?
      cashAfterModeledCosts/grossCashCollected:null,
    breakEvenSubscribers:contributionPerSubscriber>0?
      Math.ceil(fixed/contributionPerSubscriber):null,
    contributionPerSubscriber,
  };
}
/**
 * The fraction of lower-price customers needed to generate the same annual
 * contribution at the higher price, with equal non-price cost assumptions.
 * This is a threshold, NOT a forecast of price elasticity or conversion.
 */
export function higherPriceBuyerRetentionThreshold(
  lowerPrice:number,higherPrice:number,c:AnnualCostAssumptions
):number{
  if(higherPrice<=lowerPrice)
    throw new Error('Higher price must actually exceed lower price.');
  const lower=priceContribution(lowerPrice,c);
  const higher=priceContribution(higherPrice,c);
  if(lower<=0||higher<=0)
    throw new Error('Both subscriptions must make positive variable contribution.');
  return lower/higher;
}

/** Example-only, user-editable economic and reachable-market assumptions. */
export const BASE_PNW_MARKET:MarketAssumptions={
  oregonLicenseHolders:601096,
  washingtonLicenseHolders:675000,
  duplicateShareOfSmallerState:0.10,
  frequentAnglerShare:0.32,
  reachableShare:0.02,
  paidConversion:0.03,
};
export const BASE_PWA_COSTS:AnnualCostAssumptions={
  hostingPerMonth:20,databasePerMonth:25,otherFixedPerMonth:0,
  marketingPerMonth:150,founderHoursPerMonth:2,valueOfFounderHour:30,
  cardPercent:0.029,billingPercent:0.007,cardFixedPerTransaction:0.30,
  subscriberVariablePerYear:1.50,platformPercent:0,
};
export type ScenarioName='downside'|'base'|'upside';
export type ScenarioInput={name:ScenarioName;market:MarketAssumptions;costs:AnnualCostAssumptions};
export const SCENARIOS:readonly ScenarioInput[]=[
  {name:'downside',market:{...BASE_PNW_MARKET,duplicateShareOfSmallerState:0.15,
    frequentAnglerShare:0.15,reachableShare:0.002,paidConversion:0.01},
   costs:{...BASE_PWA_COSTS,marketingPerMonth:100,founderHoursPerMonth:4}},
  {name:'base',market:BASE_PNW_MARKET,costs:BASE_PWA_COSTS},
  {name:'upside',market:{...BASE_PNW_MARKET,duplicateShareOfSmallerState:0.05,
    frequentAnglerShare:0.4,reachableShare:0.05,paidConversion:0.05},
   costs:{...BASE_PWA_COSTS,marketingPerMonth:400,founderHoursPerMonth:4,
    subscriberVariablePerYear:2.5}},
] as const;
export function evaluateAllPrices(s:ScenarioInput){
  const market=marketFunnel(s.market);
  return {
    scenario:s.name,market,
    options:ANNUAL_PRICE_OPTIONS.map(price=>annualFinancials(
      price,s.costs,market.expectedAnnualSubscribers)),
  };
}
