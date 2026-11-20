import {createClient} from '@supabase/supabase-js';
import {handleLaunch} from '@/lib/backend-launch/handler.mjs';
import {washingtonReviewVersion} from '@/lib/wa-listed-review-version';

export const dynamic='force-dynamic';
export async function POST(req:Request){return handleLaunch(req,createClient,process.env,washingtonReviewVersion)}
