import type { Metadata } from "next";
import Link from "next/link";
import styles from "./about.module.css";
import { getAboutPhotoUrl } from "../../lib/about-photo";

export const metadata: Metadata = {
  title: "About Exclusive Listens",
  description: "Learn about Exclusive Listens, a listening experience built by artist Damaine Johnson for independent artists and their fans.",
  alternates: { canonical: "/about" },
  openGraph: { url: "/about" },
};

export const revalidate = 60;

export default async function AboutPage() {
  const photoUrl = await getAboutPhotoUrl();
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link className={styles.brand} href="/">EXCLUSIVE LISTENS</Link>
        <nav aria-label="Main navigation">
          <Link href="/help">Help & support</Link>
          <Link href="/">Home</Link>
        </nav>
      </header>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>ABOUT EXCLUSIVE LISTENS</p>
        <h1>Music is better when it brings us together.</h1>
        <p className={styles.intro}>
          Exclusive Listens is a home for private, shared first-listen experiences.
          Artists can share unreleased music with their community, connect with fans
          around the world, and make each listening moment count.
        </p>
      </section>
      <section className={styles.founder} aria-labelledby="founder-title">
        <p className={styles.eyebrow}>MEET THE FOUNDER</p>
        <div className={styles.founderIntro}>
          <figure className={styles.portrait}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.portraitImage} src={photoUrl} alt="Damaine Johnson, founder of Exclusive Listens" />
            ) : (
              <div className={styles.portraitPlaceholder} aria-hidden="true" />
            )}
            <figcaption>{photoUrl ? "Damaine Johnson" : "Founder photo"}</figcaption>
          </figure>
          <div>
            <h2 id="founder-title">Damaine Johnson</h2>
            <p className={styles.founderRole}>
              Founder of Exclusive Listens &amp; Famous Introvert Records
              <span>Independent Artist — Kyst</span>
            </p>
          </div>
        </div>
        <p>
          My name is Damaine Johnson, and I am the founder of Exclusive Listens and
          Famous Introvert Records. As a creative entrepreneur and independent artist
          known as Kyst, my journey in the music industry has given me firsthand insight
          into the challenges that talented artists face while trying to break through,
          build an audience, and earn a sustainable living doing what they love.
        </p>
        <p>
          One thing that stood out to me was how difficult it could be for underground
          and independent artists to gain meaningful exposure and access the resources
          needed to advance their careers. Rather than simply accepting these
          challenges, I decided to take action.
        </p>
        <p>
          My first step was establishing Famous Introvert Records, a platform designed
          to give emerging artists opportunities to develop their talents, connect with
          other creatives, and push their careers forward. I expanded that vision by
          building a label and creative studio that serves as a one-stop destination
          for creativity, offering services ranging from music production and recording
          to photography and videography. My goal was to create an environment where
          artists could access the tools and services they need to bring their ideas
          to life.
        </p>
        <p>However, as I continued learning and growing within the industry, I identified another challenge.</p>
        <p>
          Listening parties have become an important part of promoting albums, EPs, and
          other musical projects before their official release. Traditionally, these
          events can be expensive to organize and limited by location, making it
          difficult for artists to connect with fans who live in different cities or
          countries. While livestreaming platforms offer ways to reach audiences
          online, they are not always designed specifically for the listening-party
          experience or the unique needs of music creators.
        </p>
        <p className={styles.founderEmphasis}>That realization inspired me to create Exclusive Listens.</p>
        <p>
          Founded on October 24, 2026, Exclusive Listens is an online listening-party
          platform built by an artist, for artists. My vision was to create a dedicated
          digital space where musicians could bring their communities together, share
          unreleased music, and deliver a more engaging and exclusive listening
          experience without the traditional limitations of physical events.
        </p>
        <p>
          Exclusive Listens is designed to provide the essential tools for hosting
          online listening parties in one place, helping artists connect with their
          audiences through a more organized, interactive, and seamless experience.
          Beyond simply bringing listeners together, the platform also introduces
          opportunities for creators to monetize their listening parties, allowing
          them to generate revenue from their music and fan communities even before a
          project is officially released.
        </p>
        <p>
          For me, Exclusive Listens is more than just a website. It is another step
          toward building a music industry where independent artists have more control
          over how they share their work, engage their supporters, and create
          opportunities for themselves.
        </p>
        <p>
          I believe that talent deserves opportunity, creativity deserves support, and
          artists should have access to tools that help them turn their passion into
          something sustainable.
        </p>
        <p className={styles.founderEmphasis}>Exclusive Listens represents that belief in action.</p>
        <p>Welcome to the future of online listening parties.</p>
        <Link className={styles.button} href="/showcase">Explore the listening room</Link>
      </section>
      <footer className={styles.footer}>
        <span>FAMOUS INTROVERT RECORDS · EXCLUSIVE LISTENS</span>
        <Link href="/help">Need a hand? Visit Help & support</Link>
      </footer>
    </main>
  );
}
