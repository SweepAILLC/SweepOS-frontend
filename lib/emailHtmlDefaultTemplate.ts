/**
 * Default branded wrap when Intelligence enables HTML but the user has not saved custom markup yet.
 * Tokens: {{BODY_HTML}}, {{SUBJECT}}, {{SENDER_NAME}}, {{SENDER_EMAIL}}
 */
export const DEFAULT_EMAIL_HTML_TEMPLATE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{SUBJECT}}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e9f2;">
            <tr>
              <td style="padding:18px 20px;border-bottom:1px solid #eef0f7;">
                <div style="font-size:14px;font-weight:700;color:#111827;">{{SENDER_NAME}}</div>
                <div style="font-size:12px;color:#6b7280;">{{SENDER_EMAIL}}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 20px;color:#111827;font-size:14px;line-height:1.6;">
                {{BODY_HTML}}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;border-top:1px solid #eef0f7;color:#6b7280;font-size:12px;">
                Sent via SweepOS
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
