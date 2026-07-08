import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* Favicon */}
        <link rel="icon" type="image/png" href="/SWEEP_favicon.png" />
        <link rel="shortcut icon" type="image/png" href="/SWEEP_favicon.png" />
        <link rel="apple-touch-icon" href="/SWEEP_favicon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </Head>
      <body className="min-w-0 overflow-x-hidden">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

