import { listArticles } from "@/lib/articles";
import { Notice } from "@/components/notice";
import { takeNotice } from "@/lib/notices";
import { articleAction } from "@/server/actions";

export default async function ArticlesAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const articles = listArticles();
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <form className="form" action={articleAction}>
        <h2>New article</h2>
        <label>Title<input name="title" required /></label>
        <label>Dek<textarea name="dek" required /></label>
        <label>Body<textarea name="body" required /></label>
        <label>Published listing slugs<input name="listingSlugs" placeholder="loomline-census, bottleglass-metrics" /></label>
        <label className="check"><input type="checkbox" name="publish" value="yes" /> Publish now</label>
        <button type="submit">Save article</button>
      </form>
      <ul>
        {articles.map((article) => (
          <li key={article.id}>
            {article.title} · {article.status}
            <form action={articleAction}>
              <input type="hidden" name="intent" value="status" />
              <input type="hidden" name="id" value={article.id} />
              <input name="slug" defaultValue={article.slug} />
              <button name="status" value="published" type="submit">Publish</button>
              <button name="status" value="archived" className="secondary" type="submit">Archive</button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
