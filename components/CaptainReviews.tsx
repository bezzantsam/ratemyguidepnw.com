/** Reviews remain unavailable until identity mapping and publication are independently reviewed. */
export default function CaptainReviews(_props:{slug:string;expectedName:string;expectedBusiness:string|null}){
 return <section className="section" id="reviews"><h2>Ratings &amp; angler reviews</h2>
  <p role="status">Review data is unavailable.</p>
  <p>Review submissions are not currently available.</p>
 </section>;
}
