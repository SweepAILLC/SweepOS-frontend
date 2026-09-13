/**
 * /onboarding/book-call
 *
 * After invite/account setup. Embeds Cal.com onboarding booking inline.
 * On bookingSuccessful, marks the call booked via API, then opens the app (/)
 * where the driver.js feature tour starts.
 *
 * Callers:
 *   - /invite/accept after password/Google account setup
 *   - MandatoryOnboardingGate when onboarding_call_booked is false
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import { apiClient } from '@/lib/api';

const CAL_LINK = 'sweep-ai/onboarding';

/* Cal.com pre-init snippet (official pattern).
   Sets window.Cal as a command queue immediately so inline/on calls
   issued before embed.js finishes loading are buffered and replayed. */
const CAL_SNIPPET = `
(function(C,A,L){
  let p=function(a,ar){a.q.push(ar)};
  let d=C.document;
  C.Cal=C.Cal||function(){
    let cal=C.Cal;let ar=arguments;
    if(!cal.loaded){
      cal.ns={};cal.q=cal.q||[];
      d.head.appendChild(d.createElement("script")).src=A;
      cal.loaded=true;
    }
    if(ar[0]===L){
      const api=function(){p(api,arguments)};
      const ns=ar[1];api.q=api.q||[];
      typeof ns==="string"?(cal.ns[ns]=api)&&p(api,ar):p(cal,ar);
      return;
    }
    p(cal,ar);
  };
})(window,"https://cal.com/embed.js","init");
`;

declare global {
  interface Window {
    Cal?: (...args: any[]) => void;
    __onCalBooked?: () => void;
  }
}

export default function OnboardingBookCall() {
  const router = useRouter();
  const handledRef = useRef(false);

  useEffect(() => {
    if (!Cookies.get('access_token')) {
      void router.replace('/login');
      return;
    }

    // Store callback on window so the Cal snippet closure can reach it.
    window.__onCalBooked = () => {
      if (handledRef.current) return;
      handledRef.current = true;
      apiClient
        .completeOnboardingForm('cal_onboarding')
        .catch(() => {})
        .finally(() => {
          void router.replace('/');
        });
    };

    // Inject the pre-init snippet once — it sets up window.Cal as a queue.
    if (!window.Cal) {
      const snippetEl = document.createElement('script');
      snippetEl.innerHTML = CAL_SNIPPET;
      document.head.appendChild(snippetEl);
    }

    // These calls are queued immediately; embed.js processes them when it loads.
    window.Cal!('init', { origin: 'https://cal.com' });
    window.Cal!('inline', {
      calLink: CAL_LINK,
      elementOrSelector: '#cal-booking-embed',
      config: { layout: 'month_view' },
    });
    window.Cal!('on', {
      action: 'bookingSuccessful',
      callback: () => window.__onCalBooked?.(),
    });

    return () => {
      delete window.__onCalBooked;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="shrink-0 border-b border-gray-200 dark:border-white/10 px-4 py-4 sm:px-8">
        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          After account setup
        </p>
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mt-1">
          Book Your Onboarding Call
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Pick a time. After you book, we will walk you through SweepOS.
        </p>
      </div>

      {/* Cal.com inline embed — Cal targets this div by id */}
      <div className="flex-1 overflow-y-auto">
        <div
          id="cal-booking-embed"
          className="w-full"
          style={{ minHeight: 'calc(100vh - 105px)' }}
        />
      </div>
    </div>
  );
}

