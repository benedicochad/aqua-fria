import { createClient } from "@supabase/supabase-js";


const SUPABASE_URL = "https://rnzfcwpifahsbdnvipmo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuemZjd3BpZmFoc2JkbnZpcG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4ODc5NTksImV4cCI6MjA5MTQ2Mzk1OX0.PdrwZ4SAIQk_blmXOe9YGwJ5pJU5MO2_nw48jyFIrHg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);