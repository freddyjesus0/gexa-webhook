const { supabase } = require("../lib/supabase");

function validateDashboardToken(req) {
  const expectedToken = process.env.DASHBOARD_ACCESS_TOKEN;

  if (!expectedToken) {
    return {
      ok: false,
      status: 500,
      message: "Falta DASHBOARD_ACCESS_TOKEN en Vercel.",
    };
  }

  if (req.headers["x-gexa-dashboard-token"] !== expectedToken) {
    return {
      ok: false,
      status: 401,
      message: "Token del dashboard incorrecto.",
    };
  }

  return { ok: true };
}

function readPayload(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    return JSON.parse(body);
  }

  return body;
}

async function sendWhatsAppText({ phoneNumberId, to, text }) {
  if (!process.env.WHATSAPP_ACCESS_TOKEN) {
    throw new Error("Falta WHATSAPP_ACCESS_TOKEN en Vercel.");
  }

  console.log("Enviando mensaje por WhatsApp Cloud API");

  const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: text,
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.log("Error:", data);
    throw new Error(data.error?.message || "Meta no pudo enviar el mensaje.");
  }

  return data;
}

module.exports = async function responder(req, res) {
  console.log("API responder recibida");
  console.log("Metodo:", req.method);

  if (req.method !== "POST") {
    console.log("Error:", "Metodo no permitido");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const tokenResult = validateDashboardToken(req);

  if (!tokenResult.ok) {
    console.log("Error:", tokenResult.message);
    return res.status(tokenResult.status).json({ ok: false, error: tokenResult.message });
  }

  try {
    const payload = readPayload(req.body);
    const conversacionId = payload.conversacion_id;
    const texto = String(payload.texto || "").trim();

    if (!conversacionId) {
      return res.status(400).json({ ok: false, error: "Falta conversacion_id." });
    }

    if (!texto) {
      return res.status(400).json({ ok: false, error: "Falta texto para enviar." });
    }

    console.log("Buscando datos de conversacion");

    const { data: conversacion, error: conversacionError } = await supabase
      .from("conversaciones")
      .select(`
        id,
        empresa_id,
        contacto_id,
        canal_id,
        contactos (
          id,
          external_user_id
        ),
        canales (
          id,
          canal,
          external_account_id
        )
      `)
      .eq("id", conversacionId)
      .single();

    if (conversacionError) {
      console.log("Error:", conversacionError);
      return res.status(500).json({ ok: false, error: conversacionError.message });
    }

    if (conversacion.canales?.canal !== "whatsapp") {
      return res.status(400).json({ ok: false, error: "Por ahora solo se puede responder WhatsApp." });
    }

    const phoneNumberId = conversacion.canales.external_account_id;
    const to = conversacion.contactos.external_user_id;

    const metaResponse = await sendWhatsAppText({
      phoneNumberId,
      to,
      text: texto,
    });

    const metaMessageId = metaResponse.messages?.[0]?.id || null;

    console.log("Guardando mensaje saliente");

    const { data: mensaje, error: insertError } = await supabase
      .from("mensajes")
      .insert({
        empresa_id: conversacion.empresa_id,
        canal: "whatsapp",
        canal_id: conversacion.canal_id,
        contacto_id: conversacion.contacto_id,
        conversacion_id: conversacion.id,
        direccion: "saliente",
        remitente: phoneNumberId,
        texto,
        tipo_mensaje: "text",
        whatsapp_message_id: metaMessageId,
        external_message_id: metaMessageId,
        whatsapp_phone_number_id: phoneNumberId,
        payload: metaResponse,
      })
      .select(`
        id,
        conversacion_id,
        direccion,
        remitente,
        texto,
        tipo_mensaje,
        created_at
      `)
      .single();

    if (insertError) {
      console.log("Error:", insertError);
      return res.status(500).json({ ok: false, error: insertError.message });
    }

    await supabase
      .from("conversaciones")
      .update({ ultimo_mensaje_at: new Date().toISOString() })
      .eq("id", conversacion.id);

    console.log("Respuesta enviada OK");

    return res.status(200).json({
      ok: true,
      mensaje,
      meta: metaResponse,
    });
  } catch (error) {
    console.log("Error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
