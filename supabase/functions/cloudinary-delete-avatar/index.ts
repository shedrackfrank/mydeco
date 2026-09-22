import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Same reasoning as cloudinary-delete: removing a Cloudinary asset
// needs the API secret, which can never ship to the browser. Simpler
// than cloudinary-delete though -- a person can only ever touch their
// OWN avatar, so there's no separate ownership lookup needed, just
// auth.uid() itself.
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

    const { data: profile, error: profileError } = await supabaseClient
      .from('user_profiles')
      .select('avatar_public_id')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError

    if (profile.avatar_public_id) {
      const timestamp = Math.floor(Date.now() / 1000)
      const paramsToSign = `public_id=${profile.avatar_public_id}&timestamp=${timestamp}`
      const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET') ?? ''
      const encoder = new TextEncoder()
      const digest = await crypto.subtle.digest('SHA-1', encoder.encode(paramsToSign + apiSecret))
      const signature = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')

      const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME')
      const destroyBody = new URLSearchParams({
        public_id: profile.avatar_public_id,
        api_key: Deno.env.get('CLOUDINARY_API_KEY') ?? '',
        timestamp: String(timestamp),
        signature,
      })

      await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: destroyBody,
      })
      // Not checking the result here on purpose -- 'not found' just
      // means it's already gone, and even an unexpected Cloudinary
      // error shouldn't block clearing the reference in our own
      // database below.
    }

    const { error: updateError } = await supabaseClient
      .from('user_profiles')
      .update({ avatar_url: null, avatar_public_id: null })
      .eq('id', user.id)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})