import "../landing.css";

const landingMarkup = `<div class="landing" id="landingPage" dir="ltr" lang="en">
  <header class="topbar">
    <div class="topbar-inner">
      <div class="logo"><span class="logo-mark"><img src="/assets/audiencew-logo.png" alt=""></span>AudienceW</div>
      <input class="nav-toggle" id="navToggle" type="checkbox" aria-label="Open menu">
      <label class="menu-toggle" id="menuToggle" for="navToggle" aria-label="Open menu">
        <span></span><span></span><span></span>
      </label>
      <nav class="nav-links">
        <a href="#channels">Channels</a>
        <a href="#workflow">How it works</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQ</a>
      </nav>
      <a class="lang-link" href="/">العربية</a>
      <a class="btn ghost" href="/dashboard">Log in</a>
      <a class="btn primary" href="#trial">Try it</a>
    </div>
  </header>

  <main>
    <section class="hero wrap">
      <div>
        <span class="eyebrow">WhatsApp · Instagram · Google reviews</span>
        <h1>Your customers write to you from three places, and you <em>follow up from one</em></h1>
        <p>A WhatsApp message, an Instagram comment, a Google Maps review — they all land in one inbox, get assigned to your team, and get answered before the customer gives up waiting.</p>
        <div class="hero-actions">
          <a class="btn primary" href="#trial">Try AudienceW free</a>
          <a class="btn ghost" href="#channels">See how it works</a>
        </div>
        <div class="hero-note">No card required right now · our team sets up your channels with you</div>
        <div class="hero-metrics">
          <div class="metric"><b>3</b><span>core channels, minutes to connect</span></div>
          <div class="metric"><b>1</b><span>inbox for the whole team</span></div>
          <div class="metric"><b>0</b><span>messages lost between apps</span></div>
        </div>
      </div>
      <div class="product-shot">
        <div class="shot-head"><span class="dot"></span><span class="dot"></span><span class="dot"></span><strong>Inbox</strong></div>
        <div class="shot-body">
          <div class="shot-row"><div class="shot-avatar">W</div><div><b>Sarah</b><p>I want to know more about the Growth plan — do you have a sales team?</p></div><span class="pill">WhatsApp</span></div>
          <div class="shot-row"><div class="shot-avatar">I</div><div><b>@rakan.st</b><p>Does delivery reach Riyadh? Commented under the post</p></div><span class="pill">Instagram</span></div>
          <div class="shot-row"><div class="shot-avatar">G</div><div><b>New review</b><p>5 stars — "Fast service and a great reply, used them twice now"</p></div><span class="pill">Google</span></div>
          <div class="shot-row"><div class="shot-avatar">N</div><div><b>Assigned to Noura</b><p>Sarah's conversation moved to Sales and tagged "interested"</p></div><span class="pill">Support team</span></div>
        </div>
      </div>
    </section>

    <section class="section first wrap" id="channels">
      <div class="section-head">
        <span>Channels</span>
        <h2>Three channels, three different shapes</h2>
        <p class="section-lead">We don't force them to look the same. Each channel shows up the way it naturally works, but replying, assigning, and follow-up all happen the same way.</p>
      </div>
      <div class="channel-grid">
        <div class="channel-card lead">
          <span class="channel-tag">Most used</span>
          <h3>WhatsApp Business</h3>
          <p>Messages, approved templates, attachments and voice notes, and a clear 24-hour window inside every conversation instead of finding out it expired the hard way.</p>
        </div>
        <div class="channel-card">
          <span class="channel-tag">Messages &amp; comments</span>
          <h3>Instagram</h3>
          <p>Direct messages and post comments land in the same inbox, with the account name and the post they commented under right there.</p>
        </div>
        <div class="channel-card">
          <span class="channel-tag">Reputation</span>
          <h3>Google Maps reviews</h3>
          <p>A new five-star review, or a complaint? It reaches you instantly, and you reply under your business name instead of finding it a week late.</p>
        </div>
      </div>
    </section>

    <section class="section wrap">
      <div class="story">
        <p class="story-quote">"I used to open three apps every morning, and I'd usually forget to reply to Instagram comments."</p>
        <div class="story-body">
          <p>That's what happens to most teams: <strong>it's not that there are too many messages — it's that they're scattered.</strong> A message here, a comment there, a review nobody sees until a week later.</p>
          <p>AudienceW doesn't replace your channels or swap them for some odd chatbot — it brings them into one place with a <strong>clear status for every conversation</strong> (who replied, who's waiting, what's closed), plus tags and assignment so you always know who owns each customer.</p>
        </div>
      </div>
    </section>

    <section class="section wrap" id="workflow">
      <div class="section-head">
        <span>How it works</span>
        <h2>From connecting a channel to your first reply, four steps</h2>
      </div>
      <div class="timeline">
        <div class="tl-step"><b>1</b><h3>Connect your channels</h3><p>WhatsApp and Instagram via Meta, Google Maps via your Google Business Profile.</p></div>
        <div class="tl-step"><b>2</b><h3>Add your team</h3><p>Set up employees and departments, and decide who sees which conversations.</p></div>
        <div class="tl-step"><b>3</b><h3>Prepare your quick replies</h3><p>Canned answers and templates for your most repeated questions, ready before you need them.</p></div>
        <div class="tl-step"><b>4</b><h3>Watch and improve</h3><p>Reply times, who's falling behind, and where most inquiries are actually coming from.</p></div>
      </div>
    </section>

    <section class="section wrap">
      <div class="section-head">
        <span>Real examples</span>
        <h2>This is what actually happens inside the inbox</h2>
      </div>
      <div class="examples">
        <div class="message-card">
          <div class="message-top"><strong>WhatsApp message</strong><span class="pill">Sales</span></div>
          <div class="message-bubble">Hi Sarah, saw your interest in the Growth plan. Would a 5-minute call this afternoon work for you?</div>
          <div class="mini-stat"><span>Reply time</span><b>under 2 minutes</b></div>
        </div>
        <div class="message-card">
          <div class="message-top"><strong>Instagram comment</strong><span class="pill">Support</span></div>
          <div class="message-bubble">Replied to @rakan.st's comment on the "Weekend offer" post: delivery is available in Riyadh and Jeddah.</div>
          <div class="mini-stat"><span>Auto-linked</span><b>to the original post</b></div>
        </div>
        <div class="message-card">
          <div class="message-top"><strong>Google review</strong><span class="pill">Reputation</span></div>
          <div class="message-bubble">Thank you! We're glad you tried us twice and were happy with the service. Looking forward to your next visit.</div>
          <div class="mini-stat"><span>Reviews this week</span><b>18</b></div>
        </div>
      </div>
    </section>

    <section class="section wrap" id="pricing">
      <div class="section-head">
        <span>Pricing</span>
        <h2>Pick a plan for your team's size, not our assumptions about it</h2>
      </div>
      <div class="pricing" id="landingPlans">
        <div class="plan">
          <div class="plan-name"><h3>Starter</h3></div>
          <p class="plan-lead">For a business owner replying solo, or with one or two employees.</p>
          <div class="plan-price"><b>199</b><span>SAR / month</span></div>
          <ul>
            <li>3 users</li>
            <li>Shared inbox</li>
            <li>WhatsApp connection</li>
            <li>Quick replies &amp; tags</li>
            <li>Basic reports</li>
          </ul>
          <a class="btn ghost" href="#trial">Start with this</a>
        </div>
        <div class="plan featured">
          <div class="plan-name"><h3>Growth</h3><span class="plan-tag">Most picked</span></div>
          <p class="plan-lead">For a team that distributes conversations and needs WhatsApp and Instagram together.</p>
          <div class="plan-price"><b>499</b><span>SAR / month</span></div>
          <ul>
            <li>Up to 10 users</li>
            <li>WhatsApp + Instagram</li>
            <li>Team conversation routing</li>
            <li>Auto-replies &amp; routing rules</li>
            <li>Performance reports &amp; SLA</li>
          </ul>
          <a class="btn primary" href="#trial">Start with this</a>
        </div>
        <div class="plan">
          <div class="plan-name"><h3>Scale</h3></div>
          <p class="plan-lead">For a company with more than one branch that needs extra integrations.</p>
          <div class="plan-price"><b>999</b><span>SAR / month</span></div>
          <ul>
            <li>Up to 30 users</li>
            <li>WhatsApp + Instagram + Google</li>
            <li>Multiple branches &amp; teams</li>
            <li>Webhooks &amp; API</li>
            <li>Priority support</li>
          </ul>
          <a class="btn ghost" href="#trial">Start with this</a>
        </div>
      </div>
      <p class="pricing-note">Official WhatsApp message fees, where they apply, are billed separately by Meta's own pricing — not part of the subscription.</p>
    </section>

    <section class="section wrap" id="trial">
      <div class="trial-panel">
        <aside class="trial-side">
          <div>
            <span class="eyebrow">Live in minutes</span>
            <h2 id="authTitle">Try AudienceW</h2>
            <p>Tell us about your business, and we'll work out the right channels with you before any subscription.</p>
          </div>
          <ul>
            <li>A trial tailored to your current channels</li>
            <li>An initial look at how you talk to customers today</li>
            <li>We help you pick the right plan</li>
          </ul>
        </aside>
        <section class="trial-form">
          <h2 id="authModeTitle">Contact details</h2>
          <p>Keep it short — we only need this to set up the trial and understand your team's size and channels.</p>
          <form id="trialForm" class="form-grid">
            <input type="hidden" name="intent" value="trial">
            <input type="hidden" name="auth_provider" value="form">
            <input type="hidden" name="plan_name" value="Growth">
            <label>Business name<input name="company_name" required placeholder="e.g. Quality Store"></label>
            <label>Your name<input name="contact_name" required placeholder="Full name"></label>
            <label>Email<input name="email" type="email" required placeholder="name@company.com"></label>
            <label>Phone number<input name="phone" required placeholder="05xxxxxxxx"></label>
            <div class="choice-field">
              <div class="choice-title">Team size</div>
              <div class="choice-grid">
                <label class="choice-option"><input type="radio" name="team_size" value="1-3" checked><b>1-3</b><span>Small team</span></label>
                <label class="choice-option"><input type="radio" name="team_size" value="4-10"><b>4-10</b><span>Daily operations</span></label>
                <label class="choice-option"><input type="radio" name="team_size" value="11-30"><b>11-30</b><span>Multiple departments</span></label>
                <label class="choice-option"><input type="radio" name="team_size" value="30+"><b>30+</b><span>Large scale</span></label>
              </div>
            </div>
            <div class="choice-field">
              <div class="choice-title">Channels you need</div>
              <div class="choice-grid plans">
                <label class="choice-option"><input type="checkbox" name="channels" value="WhatsApp" checked><b>WhatsApp</b><span>Messages &amp; templates</span></label>
                <label class="choice-option"><input type="checkbox" name="channels" value="Instagram"><b>Instagram</b><span>Messages &amp; comments</span></label>
                <label class="choice-option"><input type="checkbox" name="channels" value="Google Maps"><b>Google Maps</b><span>Reviews &amp; replies</span></label>
              </div>
            </div>
            <label class="full"><button class="btn primary" type="submit" style="width:100%">Send trial request</button></label>
          </form>
          <p class="form-note">After you submit, our team will reach out within one business day to set up a trial that fits your channels and how you work.</p>
        </section>
      </div>
    </section>

    <section class="section wrap" id="faq">
      <div class="section-head">
        <span>FAQ</span>
        <h2>Questions most customers ask</h2>
      </div>
      <div class="faq">
        <div class="faq-item"><h3>I keep missing Instagram comments — do you handle that?</h3><p>Comments land in the same inbox as WhatsApp, linked to the post and the commenter's account name — no need to open a second app.</p></div>
        <div class="faq-item"><h3>What if I haven't set up Google Maps yet?</h3><p>We help you connect your Google Business Profile during the trial, and reviews start flowing into the platform automatically after that.</p></div>
        <div class="faq-item"><h3>Can more than one employee work at the same time?</h3><p>Yes — conversations are distributed across your team by department or employee status, and everyone only sees what they're responsible for.</p></div>
        <div class="faq-item"><h3>Is there an auto-reply outside business hours?</h3><p>Yes, you set a welcome and after-hours message, plus automatic routing to a specific employee or department based on the type of inquiry.</p></div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div>
        <div class="logo"><span class="logo-mark"><img src="/assets/audiencew-logo-light.png" alt=""></span>AudienceW</div>
        <p>A platform for managing customer conversations across WhatsApp Business, Instagram, and Google Maps reviews, for support and sales teams who want to work from one place.</p>
      </div>
      <nav class="footer-links" aria-label="Important links">
        <a href="/privacy">Privacy policy</a>
        <a href="/terms">Terms of use</a>
        <a href="/data-deletion">Data deletion</a>
        <a href="#trial">Contact us</a>
      </nav>
      <p class="footer-note">All rights reserved to Al-Jumhoor Custom Advertising Company.</p>
    </div>
  </footer>
</div>`;

export default function HomePageEn() {
  return <div dangerouslySetInnerHTML={{ __html: landingMarkup }} />;
}
