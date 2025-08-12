import backgroundImage from "../assets/utility-background.png";

export function UtilityBackground() {
  return (
    <div 
      className="fixed-background"
      style={{
        backgroundImage: `url(${backgroundImage})`
      }}
    />
  );
}