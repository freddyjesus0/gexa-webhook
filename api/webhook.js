function readPayload(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    return JSON.parse(body);
  }

  return body;
}

function getFirstWhatsAppMessage(payload) {
  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];

  if (!message) {
    return null;
  }

  return {
    message,
    phoneNumberId: value.metadata?.phone_number_id || null,
  };
}

module.exports = async function webhook(req, res) {
  console.log("Webhook recibido");
  console.log("Metodo:", req.method);

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log("Verificacion de Meta OK");
      return res.status(200).send(challenge);
    }

    console.log("Error:", "Token de verificacion incorrecto");
    return res.status(403).send("Token de verificacion incorrecto");
  }

  if (req.method !== "POST") {
    console.log("Error:", "Metodo no permitido");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  try {
    const payload = readPayload(req.body);

    console.log("Payload recibido");
    console.log(JSON.stringify(payload, null, 2));

    const whatsapp = getFirstWhatsAppMessage(payload);

    // Meta tambien envia eventos que no son mensajes, por ejemplo estados de entrega.
    if (!whatsapp) {
      console.log("Evento sin mensaje. No se inserta en Supabase.");
      return res.status(200).json({ ok: true, guardado: false });
    }

    if (!process.env.WHATSAPP_DEFAULT_EMPRESA_ID) {
      throw new Error("Falta WHATSAPP_DEFAULT_EMPRESA_ID.");
    }

    const { message, phoneNumberId } = whatsapp;

    const filaMensaje = {
      empresa_id: process.env.WHATSAPP_DEFAULT_EMPRESA_ID,
      canal: "whatsapp",
      remitente: message.from || null,
      texto: message.text?.body || null,
      tipo_mensaje: message.type || null,
      whatsapp_message_id: message.id || null,
      whatsapp_phone_number_id: phoneNumberId,
      payload,
    };

    console.log("Insertando Supabase");

    const { supabase } = require("../lib/supabase");
    const { error } = await supabase.from("mensajes").insert(filaMensaje);

    if (error) {
      console.log("Error:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    console.log("Guardado OK");
    return res.status(200).json({ ok: true, guardado: true });
  } catch (error) {
    console.log("Error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
