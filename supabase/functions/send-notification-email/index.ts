import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// The client only ever sends a `type` plus the relevant ids -- never
// raw email content. Everything about WHO gets emailed and WHAT it
// says is resolved here, server-side, using the service role key.
// That's deliberate: it's what stops this endpoint from being usable
// to send arbitrary emails to arbitrary people just by calling it with
// different content.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildEmail(type, context) {
  switch (type) {
    case 'message':
      return {
        subject: `${context.actorUsername} sent you a message on My Deco`,
        html: `<p><strong>${context.actorUsername}</strong> sent you a new message on My Deco. Log in to reply.</p>`,
      }
    case 'follow':
      return {
        subject: `${context.actorUsername} started following you on My Deco`,
        html: `<p><strong>${context.actorUsername}</strong> just followed you on My Deco.</p>`,
      }
    case 'reaction':
      return {
        subject: `${context.actorUsername} reacted to your product on My Deco`,
        html: `<p><strong>${context.actorUsername}</strong> reacted to one of your products on My Deco.</p>`,
      }
    case 'review':
      return {
        subject: `${context.actorUsername} left you a ${context.rating}-star review on My Deco`,
        html: `<p><strong>${context.actorUsername}</strong> left you a ${context.rating}/5 review on My Deco.</p>`,
      }
    default:
      return null
  }
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

    const body = await req.json()
    const { type } = body

    // Service-role client -- needed to look up another person's email
    // (auth.admin.getUserById) and to read rows regardless of RLS,
    // e.g. resolving who the other conversation participant is.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let recipientId
    let context = {}

    if (type === 'message') {
      const { data: conversation, error: convError } = await supabaseAdmin
        .from('conversations')
        .select('customer_id, decorator_id')
        .eq('id', body.conversationId)
        .single()
      if (convError) throw convError
      recipientId = conversation.customer_id === user.id ? conversation.decorator_id : conversation.customer_id
    } else if (type === 'follow') {
      recipientId = body.decoratorId
    } else if (type === 'reaction') {
      const { data: item, error: itemError } = await supabaseAdmin
        .from('portfolio_items')
        .select('decorator_id')
        .eq('id', body.portfolioItemId)
        .single()
      if (itemError) throw itemError
      recipientId = item.decorator_id
    } else if (type === 'review') {
      recipientId = body.decoratorId
      context = { rating: body.rating }
    } else {
      return new Response(JSON.stringify({ error: 'Unknown notification type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Never email someone about their own action -- cheap insurance,
    // shouldn't normally be reachable given what triggers each type.
    if (recipientId === user.id) {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const [{ data: actorProfile }, { data: recipientAuthUser }] = await Promise.all([
      supabaseAdmin.from('user_profiles').select('username').eq('id', user.id).single(),
      supabaseAdmin.auth.admin.getUserById(recipientId),
    ])

    const recipientEmail = recipientAuthUser?.user?.email
    if (!recipientEmail) throw new Error('Recipient has no email on file')

    const email = buildEmail(type, { actorUsername: actorProfile?.username || 'Someone', ...context })
    if (!email) throw new Error('Could not build email content')

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('NOTIFICATION_FROM_EMAIL') || 'My Deco <onboarding@resend.dev>',
        to: recipientEmail,
        subject: email.subject,
        html: email.html,
      }),
    })

    if (!resendResponse.ok) {
      throw new Error(`Resend error: ${await resendResponse.text()}`)
    }

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