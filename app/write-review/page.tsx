import UnifiedSearch from '@/components/UnifiedSearch';
import {directoryEntries} from '@/lib/directory';

export default function WriteReviewPage() {
  const enabled = process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED === 'true';
  return <main>
    <h1>Rate your guide</h1>
    <p className="lead">Find the guide you fished with, then share your experience.</p>
    {!enabled && <p role="status">Review submissions are currently unavailable. You can still browse guide profiles.</p>}
    <UnifiedSearch entries={directoryEntries} reviewMode reviewEnabled={enabled}/>
  </main>;
}
