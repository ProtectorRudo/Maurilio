import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/maurilio",
        disallow: [
          "/maurilio/ingresar",
          "/maurilio/onboarding",
          "/maurilio/recuperar",
          "/maurilio/actualizar-clave",
          "/maurilio/cuenta",
          "/maurilio/mis-tips",
          "/maurilio/suscripciones",
          "/maurilio/estudio",
          "/maurilio/panel-tipster",
          "/maurilio/conectar-mercadopago",
          "/maurilio/admin",
          "/maurilio/tips/",
          "/maurilio/api",
        ],
      },
    ],
    sitemap: "https://viralio.net/maurilio/sitemap.xml",
  };
}
