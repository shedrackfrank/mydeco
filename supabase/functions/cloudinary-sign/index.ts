import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Lets the browser (running on a different origin, e.g.
// http://localhost:5173) call this function at all -- without these
// headers, the browser blocks the request before it even reaches here.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Browsers send a CORS "preflight" OPTIONS request before the real
  // one -- just approve it, no actual work to do here.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Supabase already checked this request carries a valid login
    // session before our code even ran (verify_jwt is on by default
    // for new functions) -- but we still need to find out WHO it is,
    // and confirm they're specifically a decorator, not just any
    // logged-in user. SUPABASE_URL and SUPABASE_ANON_KEY are
    // automatically available here -- no need to set those as
    // secrets yourself, only the three CLOUDINARY_* ones from Part 4.
    const authHeader = req.headers.get('Authorization')
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader ?? '' } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.role !== 'decorator') {
      return new Response(JSON.stringify({ error: 'Only decorators can upload portfolio photos' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Every decorator's photos live in their own Cloudinary folder,
    // named after their user id -- keeps uploads organized, and means
    // a signature generated for one decorator's folder can never be
    // reused to upload into someone else's.
    const timestamp = Math.floor(Date.now() / 1000)
    const folder = `decorators/${user.id}`
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}`

    // Cloudinary's exact signature recipe: sort every signed parameter
    // alphabetically, join as name=value pairs with &, append the API
    // secret directly (no separator), then SHA-1 hash the whole
    // string. Getting this recipe wrong produces a signature
    // Cloudinary silently rejects as invalid.
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET') ?? ''
    const encoder = new TextEncoder()
    const digest = await crypto.subtle.digest('SHA-1', encoder.encode(paramsToSign + apiSecret))
    const signature = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')

    return new Response(
      JSON.stringify({
        signature,
        timestamp,
        folder,
        apiKey: Deno.env.get('CLOUDINARY_API_KEY'),
        cloudName: Deno.env.get('CLOUDINARY_CLOUD_NAME'),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})