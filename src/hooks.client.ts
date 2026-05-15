import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: "https://a221093866b1262ce4afc66605b7e77c@o4511392467255296.ingest.us.sentry.io/4511392478134272",
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
});

export const handleError = Sentry.handleErrorWithSentry();
