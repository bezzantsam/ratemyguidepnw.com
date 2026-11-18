import {AdminConsole} from '@/components/launch/AdminConsole';
/** The enabled console still authorizes each operation on the server. */
export default function AdminPage(){
 if(process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true')return <AdminConsole/>;
 return <main><p className="eyebrow">SITE OPERATIONS</p><h1>Moderation unavailable</h1>
  <p>Claims and review moderation are not available in this read-only directory.</p>
 </main>;
}
