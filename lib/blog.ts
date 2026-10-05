// Blog posts live here as plain data. Adding an object to `blogPosts` is all it
// takes: the /blog index, the post page and sitemap.xml all derive from it.
export type BlogBlock = { type: "h2" | "h3" | "p"; text: string };
export type BlogLocale = { title: string; description: string; blocks: BlogBlock[] };
export type BlogPost = { slug: string; date: string; ar: BlogLocale; en: BlogLocale };

export const blogPosts: BlogPost[] = [
  {
    slug: "shared-inbox-for-customer-service",
    date: "2026-10-02",
    ar: {
      title: "لماذا يحتاج فريق خدمة العملاء إلى صندوق وارد موحد؟",
      description: "كيف يوفر الصندوق الموحد وقت فريقك ويمنع ضياع المحادثات بين واتساب وإنستغرام والبريد.",
      blocks: [
        { type: "p", text: "عندما تصل رسائل العملاء إلى واتساب وإنستغرام والبريد في أماكن مختلفة، يصبح من الصعب معرفة من رد على من، وأي محادثة ما زالت تنتظر." },
        { type: "h2", text: "المشكلة: قنوات متفرقة وفريق واحد" },
        { type: "p", text: "التنقل بين التطبيقات يبطئ الرد، ويجعل متابعة العميل تعتمد على ذاكرة الموظف بدل أن تكون موثقة في النظام." },
        { type: "h2", text: "ما الذي يغيّره الصندوق الموحد؟" },
        { type: "p", text: "تظهر كل المحادثات في مكان واحد، لكل محادثة مسؤول واضح وحالة ووسوم، ويرى الفريق نفس السياق قبل الرد." },
        { type: "h2", text: "كيف تبدأ؟" },
        { type: "p", text: "اربط قنواتك، أضف فريقك وحدد صلاحياتهم، ثم وزّع المحادثات. يمكنك تجربة Linkly مجانًا لمدة 3 أيام." }
      ]
    },
    en: {
      title: "Why customer service teams need a shared inbox",
      description: "How a shared inbox saves your team time and stops conversations getting lost across WhatsApp, Instagram and email.",
      blocks: [
        { type: "p", text: "When customer messages arrive on WhatsApp, Instagram and email in different places, it is hard to know who replied to whom and which conversation is still waiting." },
        { type: "h2", text: "The problem: scattered channels, one team" },
        { type: "p", text: "Switching between apps slows replies and makes follow-up depend on an employee's memory instead of being recorded in the system." },
        { type: "h2", text: "What a shared inbox changes" },
        { type: "p", text: "Every conversation appears in one place with a clear owner, a status and tags, and the whole team sees the same context before replying." },
        { type: "h2", text: "How to get started" },
        { type: "p", text: "Connect your channels, add your team and set their permissions, then assign conversations. You can try Linkly free for 3 days." }
      ]
    }
  }
];

export function getBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}

export function sortedBlogPosts() {
  return [...blogPosts].sort((a, b) => b.date.localeCompare(a.date));
}
