const { supabase } = require("./supabase");

async function findCanalWhatsApp(phoneNumberId) {
  if (!phoneNumberId) {
    return null;
  }

  console.log("Buscando canal WhatsApp");

  const { data, error } = await supabase
    .from("canales")
    .select("id, empresa_id, nombre")
    .eq("canal", "whatsapp")
    .eq("external_account_id", phoneNumberId)
    .eq("activo", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function findOrCreateContacto({ empresaId, remitente, contactName }) {
  console.log("Buscando o creando contacto");

  const contacto = {
    empresa_id: empresaId,
    canal: "whatsapp",
    external_user_id: remitente,
    telefono: remitente,
  };

  if (contactName) {
    contacto.nombre = contactName;
  }

  const { data, error } = await supabase
    .from("contactos")
    .upsert(contacto, {
      onConflict: "empresa_id,canal,external_user_id",
    })
    .select("id, nombre")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function findOrCreateConversacion({ empresaId, canalId, contactoId }) {
  console.log("Buscando conversacion abierta");

  const { data: conversacionExistente, error: findError } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("contacto_id", contactoId)
    .eq("estado", "abierta")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw findError;
  }

  if (conversacionExistente) {
    return conversacionExistente;
  }

  console.log("Creando conversacion");

  const { data, error } = await supabase
    .from("conversaciones")
    .insert({
      empresa_id: empresaId,
      canal_id: canalId,
      contacto_id: contactoId,
      estado: "abierta",
      ultimo_mensaje_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function saveIncomingWhatsAppMessage({ payload, message, contactName, phoneNumberId }) {
  const canal = await findCanalWhatsApp(phoneNumberId);

  let empresaId = canal?.empresa_id;

  if (!empresaId) {
    empresaId = process.env.WHATSAPP_DEFAULT_EMPRESA_ID;
    console.log("Canal no encontrado. Usando empresa por defecto:", empresaId);
  }

  if (!empresaId) {
    throw new Error("No se encontro empresa para este WhatsApp.");
  }

  const contacto = await findOrCreateContacto({
    empresaId,
    remitente: message.from || "desconocido",
    contactName,
  });

  const conversacion = await findOrCreateConversacion({
    empresaId,
    canalId: canal?.id || null,
    contactoId: contacto.id,
  });

  const filaMensaje = {
    empresa_id: empresaId,
    canal: "whatsapp",
    canal_id: canal?.id || null,
    contacto_id: contacto.id,
    conversacion_id: conversacion.id,
    direccion: "entrante",
    remitente: message.from || null,
    texto: message.text?.body || null,
    tipo_mensaje: message.type || null,
    whatsapp_message_id: message.id || null,
    external_message_id: message.id || null,
    whatsapp_phone_number_id: phoneNumberId,
    payload,
  };

  console.log("Insertando Supabase");

  const { error } = await supabase.from("mensajes").insert(filaMensaje);

  if (error?.code === "23505") {
    console.log("Mensaje duplicado. No se inserta otra vez.");
    return { guardado: false, duplicado: true };
  }

  if (error) {
    throw error;
  }

  console.log("Actualizando conversacion");

  await supabase
    .from("conversaciones")
    .update({ ultimo_mensaje_at: new Date().toISOString() })
    .eq("id", conversacion.id);

  return { guardado: true, duplicado: false };
}

module.exports = { saveIncomingWhatsAppMessage };
