import {createClient} from '@supabase/supabase-js';
import {handleLaunch} from '@/lib/backend-launch/handler.mjs';

export const dynamic='force-dynamic';
export async function POST(req:Request){return handleLaunch(req,createClient,process.env)}
