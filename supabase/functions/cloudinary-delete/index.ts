import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Same reasoning as cloudinary-sign: deleting a Cloudinary asset needs
// the API secret, which can never be shipped to the browser -- so this
// runs server-side instead. It also deletes the portfolio_items row
// itself, so the client only has to make one call instead of
// coordinating two separate operations that could get out of sync if
// one succeeded and the other failed.
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

    const { portfolioItemId } = await req.json()
    if (!portfolioItemId) {
      return new Response(JSON.stringify({ error: 'portfolioItemId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Portfolio items are readable by ANY logged-in user (that's how
    // customers browse them), so this select alone doesn't prove
    // ownership -- the explicit decorator_id check below is what
    // actually stops one decorator from deleting another's photo by
    // guessing an id.
    const { data: item, error: itemError } = await supabaseClient
      .from('portfolio_items')
      .select('decorator_id, image_public_id')
      .eq('id', portfolioItemId)
      .maybeSingle()

    if (itemError) throw itemError
    if (!item) {
      return new Response(JSON.stringify({ error: 'Portfolio item not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (item.decorator_id !== user.id) {
      return new Response(JSON.stringify({ error: 'You can only delete your own portfolio photos' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Older items saved before this cleanup existed may not have a
    // public_id on file -- nothing to remove from Cloudinary in that
    // case, just proceed straight to deleting the database row.
    let cloudinaryWarning = null
    if (item.image_public_id) {
      const timestamp = Math.floor(Date.now() / 1000)
      const paramsToSign = `public_id=${item.image_public_id}&timestamp=${timestamp}`
      const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET') ?? ''
      const encoder = new TextEncoder()
      const digest = await crypto.subtle.digest('SHA-1', encoder.encode(paramsToSign + apiSecret))
      const signature = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')

      const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME')
      const destroyBody = new URLSearchParams({
        public_id: item.image_public_id,
        api_key: Deno.env.get('CLOUDINARY_API_KEY') ?? '',
        timestamp: String(timestamp),
        signature,
      })

      const cloudinaryResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: destroyBody }
      )
      const cloudinaryResult = await cloudinaryResponse.json()

      // 'not found' just means it's already gone from Cloudinary --
      // fine, treat it the same as a successful delete. Anything else
      // unexpected is logged as a warning but doesn't block removing
      // the database row -- a decorator shouldn't be stuck with a
      // photo they can't remove from their own dashboard just because
      // Cloudinary had a transient error.
      if (cloudinaryResult.result !== 'ok' && cloudinaryResult.result !== 'not found') {
        cloudinaryWarning = `Cloudinary cleanup may have failed: ${cloudinaryResult.result || 'unknown error'}`
      }
    }

    const { error: deleteError } = await supabaseClient
      .from('portfolio_items')
      .delete()
      .eq('id', portfolioItemId)

    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ success: true, cloudinaryWarning }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})