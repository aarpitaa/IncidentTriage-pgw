import { db } from '../server/db.js';
import { riskIncidents, riskRepairs, riskPipelines, riskWeather } from '../shared/schema.js';
import dayjs from 'dayjs';

// Philadelphia-like bounding box
const BOUNDS = {
  minLat: 39.90,
  maxLat: 40.10,
  minLng: -75.30,
  maxLng: -75.00
};

// Utility functions
function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

function randomLatLng() {
  return {
    lat: randomInRange(BOUNDS.minLat, BOUNDS.maxLat),
    lng: randomInRange(BOUNDS.minLng, BOUNDS.maxLng)
  };
}

function randomDate(daysAgo) {
  return dayjs().subtract(Math.floor(Math.random() * daysAgo), 'day').toDate();
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Generate pipeline path (simplified LineString)
function generatePipelinePath() {
  const start = randomLatLng();
  const numPoints = 3 + Math.floor(Math.random() * 5); // 3-7 points
  const coordinates = [start];
  
  let current = start;
  for (let i = 1; i < numPoints; i++) {
    current = {
      lat: current.lat + randomInRange(-0.01, 0.01),
      lng: current.lng + randomInRange(-0.01, 0.01)
    };
    // Keep within bounds
    current.lat = Math.max(BOUNDS.minLat, Math.min(BOUNDS.maxLat, current.lat));
    current.lng = Math.max(BOUNDS.minLng, Math.min(BOUNDS.maxLng, current.lng));
    coordinates.push(current);
  }
  
  return {
    type: "LineString",
    coordinates: coordinates.map(c => [c.lng, c.lat]) // GeoJSON format: [lng, lat]
  };
}

async function seedRiskMap() {
  console.log('🌱 Seeding risk map data...');
  
  try {
    // Seed risk incidents (~200 over last 90 days)
    console.log('📍 Generating risk incidents...');
    const incidents = [];
    const categories = ['Gas Leak', 'Power Outage', 'Water Main', 'Equipment Failure', 'Emergency'];
    const severities = ['High', 'Medium', 'Low'];
    const severityWeights = [0.2, 0.5, 0.3]; // 20% High, 50% Medium, 30% Low
    
    for (let i = 0; i < 200; i++) {
      const pos = randomLatLng();
      const severityIndex = Math.random() < severityWeights[0] ? 0 : 
                           Math.random() < (severityWeights[0] + severityWeights[1]) ? 1 : 2;
      
      incidents.push({
        lat: pos.lat,
        lng: pos.lng,
        category: randomChoice(categories),
        severity: severities[severityIndex],
        occurredAt: randomDate(90)
      });
    }
    
    await db.insert(riskIncidents).values(incidents);
    console.log(`✓ Created ${incidents.length} risk incidents`);
    
    // Seed risk repairs (~60 with varied status)
    console.log('🔧 Generating risk repairs...');
    const repairs = [];
    const statuses = ['Open', 'InProgress', 'Closed'];
    const statusWeights = [0.3, 0.4, 0.3]; // 30% Open, 40% InProgress, 30% Closed
    
    for (let i = 0; i < 60; i++) {
      const pos = randomLatLng();
      const statusIndex = Math.random() < statusWeights[0] ? 0 : 
                         Math.random() < (statusWeights[0] + statusWeights[1]) ? 1 : 2;
      const status = statuses[statusIndex];
      const openedAt = randomDate(120);
      
      repairs.push({
        lat: pos.lat,
        lng: pos.lng,
        status: status,
        openedAt: openedAt,
        closedAt: status === 'Closed' ? dayjs(openedAt).add(Math.floor(Math.random() * 30), 'day').toDate() : null
      });
    }
    
    await db.insert(riskRepairs).values(repairs);
    console.log(`✓ Created ${repairs.length} risk repairs`);
    
    // Seed risk pipelines (~20 LineStrings)
    console.log('🚰 Generating risk pipelines...');
    const pipelines = [];
    const materials = ['Steel', 'Cast Iron', 'Plastic', 'Copper', 'PVC'];
    
    for (let i = 0; i < 20; i++) {
      pipelines.push({
        pathGeojson: generatePipelinePath(),
        installYear: 1970 + Math.floor(Math.random() * 51), // 1970-2020
        material: randomChoice(materials)
      });
    }
    
    await db.insert(riskPipelines).values(pipelines);
    console.log(`✓ Created ${pipelines.length} risk pipelines`);
    
    // Seed risk weather (~300 points over last 30 days)
    console.log('🌤️ Generating risk weather data...');
    const weather = [];
    
    for (let i = 0; i < 300; i++) {
      const pos = randomLatLng();
      weather.push({
        lat: pos.lat,
        lng: pos.lng,
        tempC: randomInRange(-10, 35), // -10°C to 35°C
        windKph: randomInRange(0, 80), // 0 to 80 km/h
        precipMm: Math.random() < 0.3 ? randomInRange(0, 50) : 0, // 30% chance of precipitation
        observedAt: randomDate(30)
      });
    }
    
    await db.insert(riskWeather).values(weather);
    console.log(`✓ Created ${weather.length} weather observations`);
    
    console.log('🎉 Risk map seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding risk map data:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedRiskMap().then(() => {
    console.log('✅ Seeding complete');
    process.exit(0);
  });
}

export { seedRiskMap };