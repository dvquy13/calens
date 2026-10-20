export default function DemoVideo() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 lg:px-16 xl:px-20">
      <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4 text-center">
        See Calens in Action
      </h2>
      <p className="text-foreground-light mb-8 text-sm text-center">
        Watch how Calens transforms your Google Calendar experience
      </p>
      <div className="max-w-4xl mx-auto">
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute top-0 left-0 w-full h-full rounded-xl shadow-lg"
            src="https://www.youtube.com/embed/laHoBKhBiyg"
            title="Calens Demo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
