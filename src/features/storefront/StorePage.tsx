import parse, {
  domToReact,
  Element,
  type DOMNode,
  type HTMLReactParserOptions,
  attributesToProps,
} from "html-react-parser";
import { StoreScripts } from "./StoreScripts";
import { readStorePage, readPublicCatalog } from "./source";
import { HeroCarousel } from "./HeroCarousel";
import { StoreHeader } from "./StoreHeader";
// Shared React primitives retain the approved HTML contracts while data/generators migrate.
function Header({
  node,
  options,
}: {
  node: Element;
  options: HTMLReactParserOptions;
}) {
  return (
    <header {...attributesToProps(node.attribs)}>
      {domToReact(node.children as DOMNode[], options)}
    </header>
  );
}
function Footer({
  node,
  options,
}: {
  node: Element;
  options: HTMLReactParserOptions;
}) {
  return (
    <footer {...attributesToProps(node.attribs)}>
      {domToReact(node.children as DOMNode[], options)}
    </footer>
  );
}
function ProductCard({
  node,
  options,
}: {
  node: Element;
  options: HTMLReactParserOptions;
}) {
  return (
    <article {...attributesToProps(node.attribs)}>
      {domToReact(node.children as DOMNode[], options)}
    </article>
  );
}
function Navigation({
  node,
  options,
}: {
  node: Element;
  options: HTMLReactParserOptions;
}) {
  return (
    <nav {...attributesToProps(node.attribs)}>
      {domToReact(node.children as DOMNode[], options)}
    </nav>
  );
}
function StoreForm({
  node,
  options,
}: {
  node: Element;
  options: HTMLReactParserOptions;
}) {
  return (
    <form {...attributesToProps(node.attribs)}>
      {domToReact(node.children as DOMNode[], options)}
    </form>
  );
}
export async function StorePage({ slug }: { slug: string }) {
  const [source, catalog] = await Promise.all([
    readStorePage(slug),
    readPublicCatalog(),
  ]);
  const hasReactHeader = source.body.includes('class="store-header"');
  const hasReactHero = source.body.includes("data-real-hero");
  const options: HTMLReactParserOptions = {
    replace(node) {
      if (!(node instanceof Element)) return;
      if (node.name === "script" && node.attribs.src) return <></>;
      if (
        node.name === "section" &&
        node.attribs["data-real-hero"] !== undefined
      ) {
        const track = node.children.find(
          (n) => n instanceof Element && n.attribs.class === "real-hero__track",
        );
        if (track instanceof Element) {
          const slides = track.children
            .filter(
              (n): n is Element =>
                n instanceof Element && n.attribs["data-clone"] === "false",
            )
            .map((n) => ({
              label: n.attribs["aria-label"],
              content: domToReact(n.children as DOMNode[], options),
            }));
          return (
            <HeroCarousel slides={slides} label={node.attribs["aria-label"]} />
          );
        }
      }
      if (node.name === "header") {
        if (node.attribs.class?.includes("store-header")) {
          return <StoreHeader catalog={catalog} slug={slug} />;
        }
        return <Header node={node} options={options} />;
      }
      if (node.name === "footer")
        return <Footer node={node} options={options} />;
      if (node.name === "nav")
        return <Navigation node={node} options={options} />;
      if (node.name === "form")
        return <StoreForm node={node} options={options} />;
      if (
        node.name === "article" &&
        node.attribs.class?.includes("store-product-card")
      )
        return <ProductCard node={node} options={options} />;
    },
  };
  const body = parse(source.body, options);
  const scripts = source.scripts.filter(
    (src) =>
      !(hasReactHero && /^\/(hero-media|real-photos)\.js\?/.test(src)) &&
      !(hasReactHeader && /^\/storefront-ui\.js\?/.test(src)),
  );
  return (
    <>
      {source.styles.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div className={source.bodyClass}>{body}</div>
      <StoreScripts scripts={scripts} bodyClass={source.bodyClass} />
    </>
  );
}
