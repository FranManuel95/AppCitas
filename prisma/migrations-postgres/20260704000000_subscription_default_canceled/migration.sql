-- El default de subscriptionStatus pasa de 'trialing' a 'canceled': un negocio
-- sin suscripción explícita no debe figurar "en prueba". register-business fija
-- pro/trialing +14 días en el alta real, así que el default solo aplica a filas
-- creadas sin valor (semilla u otros orígenes directos).
ALTER TABLE "Business" ALTER COLUMN "subscriptionStatus" SET DEFAULT 'canceled';
