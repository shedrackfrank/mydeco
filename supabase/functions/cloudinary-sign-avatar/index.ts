import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Parallel to cloudinary-sign, deliberately kept as a separate
// function rather than adding a role branch to that one -- portfolio
// uploads already depend on cloudinary-sign working exactly as it
// does, and this avoids any risk of touching that. The only real
// difference: no role check (both customers and decorators have
// avatars) and a different folder (avatars/{user.id} instead of
// decorators/{user.id}).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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

    // Every user's avatar lives in their own folder, named after
    // their user id -- same reasoning as decorators/{user.id} for
    // portfolio photos: a signature for one person's folder can never
    // be reused to upload into someone else's.
    const timestamp = Math.floor(Date.now() / 1000)
    const folder = `avatars/${user.id}`
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}`

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