const { supabase } = require("../lib/supabase");

function getEmpresaId(req) {
  return req.query.empresa_id || process.env.WHATSAPP_DEFAULT_EMPRESA_ID || "personal";
}

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

function groupMessagesByConversation(messages) {
  const grouped = {};

  for (const message of messages) {
    if (!grouped[message.conversacion_id]) {
      grouped[message.conversacion_id] = [];
    }

    grouped[message.conversacion_id].push(message);
  }

  return grouped;
}

module.exports = async function conversaciones(req, res) {
  console.log("API conversaciones recibida");
  console.log("Metodo:", req.method);

  if (req.method !== "GET") {
    console.log("Error:", "Metodo no permitido");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const tokenResult = validateDashboardToken(req);

  if (!tokenResult.ok) {
    console.log("Error:", tokenResult.message);
    return res.status(tokenResult.status).json({ ok: false, error: tokenResult.message });
  }

  try {
    const empresaId = getEmpresaId(req);

    console.log("Buscando conversaciones de empresa:", empresaId);

    const { data: conversacionesData, error: conversacionesError } = await supabase
      .from("conversaciones")
      .select(`
        id,
        empresa_id,
        estado,
        ultimo_mensaje_at,
        created_at,
        contactos (
          id,
          nombre,
          telefono,
          external_user_id,
          canal
        ),
        canales (
          id,
          nombre,
          canal
        )
      `)
      .eq("empresa_id", empresaId)
      .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false });

    if (conversacionesError) {
      console.log("Error:", conversacionesError);
      return res.status(500).json({ ok: false, error: conversacionesError.message });
    }

    if (!conversacionesData.length) {
      return res.status(200).json({ ok: true, empresa_id: empresaId, conversaciones: [] });
    }

    const conversationIds = conversacionesData.map((conversation) => conversation.id);

    console.log("Buscando mensajes de conversaciones");

    const { data: mensajesData, error: mensajesError } = await supabase
      .from("mensajes")
      .select(`
        id,
        conversacion_id,
        direccion,
        remitente,
        texto,
        tipo_mensaje,
        created_at
      `)
      .in("conversacion_id", conversationIds)
      .order("created_at", { ascending: true });

    if (mensajesError) {
      console.log("Error:", mensajesError);
      return res.status(500).json({ ok: false, error: mensajesError.message });
    }

    const mensajesPorConversacion = groupMessagesByConversation(mensajesData || []);

    const conversaciones = conversacionesData.map((conversation) => ({
      ...conversation,
      mensajes: mensajesPorConversacion[conversation.id] || [],
    }));

    return res.status(200).json({
      ok: true,
      empresa_id: empresaId,
      conversaciones,
    });
  } catch (error) {
    console.log("Error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
