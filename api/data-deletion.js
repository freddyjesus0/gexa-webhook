module.exports = async function dataDeletion(req, res) {
  console.log("Solicitud de eliminacion de datos recibida");
  console.log("Metodo:", req.method);

  const confirmationCode = `gexa-delete-${Date.now()}`;

  return res.status(200).json({
    url: "https://gexa-webhook.vercel.app/data-deletion",
    confirmation_code: confirmationCode,
  });
};
