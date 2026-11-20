import {createClient} from '@supabase/supabase-js';
import {handleGuideOfferings} from '@/lib/guide-offerings/handler.mjs';

export const dynamic='force-dynamic';

export async function POST(request:Request) {
 return handleGuideOfferings(request,createClient,process.env);
}
