import {AuthCheck} from '@/components/launch/AuthCheck';
import {AdminConsole} from '@/components/launch/AdminConsole';
/** The enabled console still authorizes each operation on the server. */
export default function AdminPage(){
 if(process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true')return <AdminConsole offeringsEnabled={process.env.RMG_GUIDE_OFFERINGS_ENABLED==='true'} claimsEnabled={process.env.NEXT_PUBLIC_RMG_CLAIMS_ENABLED==='true'}/>;
 if(process.env.NEXT_PUBLIC_RMG_AUTH_CHECK_ENABLED==='true')return <main className="launch-controls">
  <p className="eyebrow">SITE OPERATIONS</p>
  <h1>Moderator sign-in</h1>
  <AuthCheck moderator/>
 </main>;
 return <main><p className="eyebrow">SITE OPERATIONS</p><h1>Moderation unavailable</h1>
  <p>Claims and review moderation are not available in this read-only directory.</p>
 </main>;
}
