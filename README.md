# RecoverFlow

**See what failed payments are silently costing your SaaS — and how much a dunning flow would win back.**

RecoverFlow is a client-side failed-payment / involuntary-churn revenue-leak
calculator. Enter your MRR (or subscribers × ARPU), tweak the failure rate and
your current vs. target recovery rates, and it shows the recurring revenue
you're losing to failed charges — plus how much a dedicated dunning flow would
recover. The result includes a clear labelled breakdown and a one-line shareable
summary.

A **Copper Bay Labs** product.

- **Live:** https://dukotah.github.io/recoverflow/
- **100% client-side.** Every calculation runs in your browser. The numbers you
  enter are never uploaded, transmitted, logged, or stored. There is no backend —
  open the Network tab and watch: nothing leaves the page. It even works offline.

## The benchmarks (every default is editable)

- **~9%** of subscription charges fail in a given month.
- **20–40%** of churn is involuntary (failed payments, not cancellations).
- **~38%** of failed charges are recovered by Stripe's built-in Smart Retries.
- **60–80%** is recovered by a dedicated dunning flow (smart retry timing plus
  card-update emails, SMS, and in-app prompts).

See [How it works](about.html) for the full formula, the sources behind each
default, and what the model deliberately leaves out.

## Run it locally

No build step, no dependencies. Just open `index.html` in any modern browser:

```
git clone https://github.com/dukotah/recoverflow.git
cd recoverflow
# open index.html (double-click, or `start index.html` on Windows)
```

Because everything runs locally, you can disconnect from the network and it
still works.

## What it is (and isn't)

RecoverFlow is a **planning estimate**, not an audited forecast or financial
advice. It models a steady-state month (MRR × failure rate, split by recovery
rate) and multiplies to a year. It doesn't model the compounding lifetime value
of a recovered customer (which makes the real loss *larger*), seasonality, fees,
or your exact card mix. Treat its output as a credible order-of-magnitude.

## Roadmap

- **The RecoverFlow recovery engine** — the paid product that plugs the leak:
  connect Stripe, and it runs the smart-retry schedule and the email / SMS /
  in-app dunning sequence automatically, turning the win-back number into
  recovered revenue.

---

A [Copper Bay Labs](https://copperbaytech.com) product.
