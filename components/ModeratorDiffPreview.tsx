import type {ReviewSummary,ReviewRisk} from '@/lib/moderation-review';

const level:Record<ReviewRisk,string>={
 low:'Routine edit — still requires human review',
 medium:'Changes to trips, waterways or boats',
 high:'First-time submission or ownership review',
};

export default function ModeratorDiffPreview({
  summary,profileLabel,submittedLabel,
}:{summary:ReviewSummary;profileLabel:string;submittedLabel:string}){
 return <section className="moderation-review-preview" aria-labelledby="moderation-review-heading">
   <div className="moderation-review-heading">
     <div><p className="eyebrow">PRIVATE REVIEW DESIGN DEMO · SYNTHETIC RECORD</p>
       <h2 id="moderation-review-heading">Proposed updates: {profileLabel}</h2>
       <p className="muted">Submitted: {submittedLabel} · Illustrative information only</p>
     </div>
     <span className={'moderation-risk moderation-risk-'+summary.risk}>
       {summary.risk.toUpperCase()} PRIORITY
     </span>
   </div>
   <p><strong>{level[summary.risk]}</strong></p>
   <p>Changes are proposals, not published facts. A queue label does not verify captain identity, legal licensing, insurance or boating credentials.</p>
   {summary.changes.length===0?<p className="muted">No changed fields detected.</p>:
     <div className="moderation-review-list" role="list" aria-label="Changed proposal fields">
       {summary.changes.map(change=><article key={change.path} role="listitem" className="moderation-review-change">
         <div className="moderation-review-change-heading"><strong>{change.label}</strong>
           <span>{change.kind==='added'?'Added':change.kind==='removed'?'Removed':'Changed'}</span>
         </div>
         <div className="moderation-compare">
           <div><small>BEFORE — APPROVED</small><p>{change.before}</p></div>
           <div><small>AFTER — PROPOSED</small><p>{change.after}</p></div>
         </div>
       </article>)}
     </div>}
   {summary.flags.length>0&&<section className="moderation-review-flags" aria-label="Potential credential claims">
     <h3>Claims requiring independent evidence</h3>
     <p className="muted">These are automated review flags, not findings of wrongdoing or proof of credentials.</p>
     <ul>{summary.flags.map(flag=><li key={flag.path}>
       <strong>{flag.path}</strong>: {flag.message}
     </li>)}</ul>
   </section>}
   <section className="moderation-review-warnings" aria-label="Reviewer attention">
     <h3>Reviewer checks</h3>
     <ul>{summary.warnings.map(note=><li key={note}>{note}</li>)}</ul>
   </section>
   <p className="moderation-review-disabled" role="status">
     <strong>No moderation actions are connected.</strong> This is a local-only design preview.
     Approve, reject, request changes and publish will require separately tested administrator
     authorization, audit history and live database policies.
   </p>
 </section>;
}
