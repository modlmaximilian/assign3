
const parseDate = d3.timeParse("%Y-%m-%d");

const yearSlider   = document.getElementById("yearSlider"); 
const yearText     = document.getElementById("yearText");   
const mapLevelSlider = document.getElementById("mapLevelSlider");
const pollutantSel = document.getElementById("pollutant");
const playButton   = document.getElementById("playButton");
const tooltip      = d3.select("#tooltip");

let allMonths = [];          
let currentMonthIndex = 0;   
let currentMonthKey;         
let currentLevel;
let currentPollutant;

let stateAgg, countyAgg;
let stateFeatures, countyFeatures;
let stateIdToName;

const AQI_MIN = 0;
const AQI_MAX = 300; 

const width  = 1440;
const height = 900;

const svg = d3.select("#map")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

const g = svg.append("g");

const projection = d3.geoAlbersUsa()
  .translate([width / 2, height / 2])
  .scale(1200);

const path = d3.geoPath().projection(projection);

const color = d3.scaleSequential()
  .domain([AQI_MIN, AQI_MAX])
  .interpolator(d3.interpolateYlOrRd)
  .clamp(true);

const zoom = d3.zoom()
  .scaleExtent([1, 8])
  .translateExtent([[0, 0], [width, height]])
  .on("zoom", (event) => {
    g.attr("transform", event.transform);
  });

svg.call(zoom);

const legendWidth  = 260;
const legendHeight = 10;

const legendSvg = d3.select("#legend")
  .append("svg")
  .attr("width", legendWidth + 60)
  .attr("height", 80);

const legendGroup = legendSvg.append("g")
  .attr("transform", "translate(30, 30)");

legendGroup.append("text")
  .attr("class", "legend-title")
  .attr("x", 0)
  .attr("y", -10)
  .text("AQI");

const defs = legendSvg.append("defs");

const gradient = defs.append("linearGradient")
  .attr("id", "legend-gradient")
  .attr("x1", "0%")
  .attr("x2", "100%")
  .attr("y1", "0%")
  .attr("y2", "0%");

legendGroup.append("rect")
  .attr("x", 0)
  .attr("y", 0)
  .attr("width", legendWidth)
  .attr("height", legendHeight)
  .attr("fill", "url(#legend-gradient)");

const legendScale = d3.scaleLinear()
  .domain([AQI_MIN, AQI_MAX])
  .range([0, legendWidth]);

const legendAxis  = d3.axisBottom(legendScale)
  .tickValues([0, 50, 100, 150, 200, 300])
  .tickFormat(d3.format("d"));

const legendAxisGroup = legendGroup.append("g")
  .attr("class", "legend-axis")
  .attr("transform", `translate(0, ${legendHeight})`);

function updateLegend() {
  const nStops = 10;
  const stops = d3.range(nStops).map(i => i / (nStops - 1));

  gradient.selectAll("stop").remove();
  gradient.selectAll("stop")
    .data(stops)
    .enter()
    .append("stop")
    .attr("offset", d => `${d * 100}%`)
    .attr("stop-color", d => color(AQI_MIN + d * (AQI_MAX - AQI_MIN)));

  legendAxisGroup.call(legendAxis);
}

updateLegend();

Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json"),
  d3.csv("./data.csv", d => {
    const date = parseDate(d.Date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; 
    const ym = `${year}-${String(month).padStart(2, "0")}`; 

    return {
      state:  d.State.trim(),
      county: d.County.trim(),
      year,
      month,
      ym,
      o3AQI:  +d["O3 AQI"],
      coAQI:  +d["CO AQI"],
      so2AQI: +d["SO2 AQI"],
      no2AQI: +d["NO2 AQI"]
    };
  })
]).then(([statesTopo, countiesTopo, rows]) => {
  allMonths = Array.from(new Set(rows.map(d => d.ym))).sort();  

  const defaultIndex = 0;
  currentMonthIndex = defaultIndex;
  currentMonthKey   = allMonths[defaultIndex];

  yearSlider.min = 0;
  yearSlider.max = allMonths.length - 1;
  yearSlider.value = defaultIndex;
  yearText.value   = currentMonthKey;

  stateAgg = d3.rollup(
    rows,
    v => ({
      "O3 AQI":  d3.mean(v, d => d.o3AQI),
      "CO AQI":  d3.mean(v, d => d.coAQI),
      "SO2 AQI": d3.mean(v, d => d.so2AQI),
      "NO2 AQI": d3.mean(v, d => d.no2AQI)
    }),
    d => d.state,
    d => d.ym
  );

  countyAgg = d3.rollup(
    rows,
    v => ({
      "O3 AQI":  d3.mean(v, d => d.o3AQI),
      "CO AQI":  d3.mean(v, d => d.coAQI),
      "SO2 AQI": d3.mean(v, d => d.so2AQI),
      "NO2 AQI": d3.mean(v, d => d.no2AQI)
    }),
    d => `${d.state}|${d.county}`,
    d => d.ym
  );

  stateFeatures  = topojson.feature(statesTopo, statesTopo.objects.states).features;
  countyFeatures = topojson.feature(countiesTopo, countiesTopo.objects.counties).features;

  stateIdToName = new Map(
    stateFeatures.map(f => [String(f.id).padStart(2, "0"), f.properties.name])
  );

  countyFeatures.forEach(f => {
    const countyFips = String(f.id).padStart(5, "0");
    const stateFips  = countyFips.slice(0, 2);
    const stateName  = stateIdToName.get(stateFips);
    f.properties.stateName = stateName || null;
  });

  currentLevel      = "state";   
  mapLevelSlider.value = 0;    
  currentPollutant  = pollutantSel.value;     

  renderMap();

  yearSlider.addEventListener("input", () => {
    currentMonthIndex = +yearSlider.value;
    currentMonthKey   = allMonths[currentMonthIndex];
    yearText.value    = currentMonthKey;
    renderMap();
  });

  mapLevelSlider.addEventListener("input", () => {
  currentLevel = mapLevelSlider.value === "0" ? "state" : "county";
  renderMap();
  });

  pollutantSel.addEventListener("change", () => {
    currentPollutant = pollutantSel.value;
    renderMap();
  });

  let playing = false;
  let playInterval = null;

  playButton.addEventListener("click", () => {
    playing = !playing;

    if (playing) {
      playButton.textContent = "⏸ Pause";

      playInterval = setInterval(() => {
        let i = +yearSlider.value;

        if (i >= allMonths.length - 1) {
          clearInterval(playInterval);
          playing = false;
          playButton.textContent = "▶ Play";
          return;
        }

        i++;
        yearSlider.value   = i;
        currentMonthIndex  = i;
        currentMonthKey    = allMonths[i];
        yearText.value     = currentMonthKey;
        renderMap();

      }, 500);

    } else {
      playButton.textContent = "▶ Play";
      clearInterval(playInterval);
    }
  });
});


function renderMap() {
  if (!stateFeatures || !countyFeatures) return;

  let features, agg, keyAccessor, labelAccessor;

  if (currentLevel === "state") {
    features      = stateFeatures;
    agg           = stateAgg;
    keyAccessor   = d => d.properties.name;
    labelAccessor = d => d.properties.name;
  } else {
    features      = countyFeatures;
    agg           = countyAgg;
    keyAccessor   = d => `${d.properties.stateName}|${d.properties.name}`;
    labelAccessor = d => `${d.properties.name}, ${d.properties.stateName}`;
  }

  const valuesByKey = new Map();
  agg.forEach((monthsMap, key) => {
    const vals = monthsMap.get(currentMonthKey);
    if (vals && vals[currentPollutant] != null && !isNaN(vals[currentPollutant])) {
      valuesByKey.set(key, vals[currentPollutant]);
    }
  });

  const values = Array.from(valuesByKey.values());
  if (!values.length) {
    console.warn("No data for", currentLevel, "in", currentMonthKey);
    return;
  }

  const paths = g.selectAll("path.geo")
    .data(features, keyAccessor);

  paths.exit().remove();

  const pathsEnter = paths.enter()
    .append("path")
    .attr("class", "geo")
    .attr("stroke", "#999")
    .attr("stroke-width", 0.3);

  pathsEnter.merge(paths)
    .attr("d", path)
    .attr("fill", d => {
      const key = keyAccessor(d);
      const v   = valuesByKey.get(key);
      return v != null ? color(v) : "#eee";
    })
    .on("mouseover", (event, d) => {
      const key = keyAccessor(d);
      const v   = valuesByKey.get(key);
      const label = labelAccessor(d);
      const valueText = v != null ? v.toFixed(1) : "no data";

      tooltip
        .style("opacity", 1)
        .html(
          `<strong>${label}</strong><br>` +
          `${currentPollutant}: ${valueText}<br>` +
          `${currentMonthKey}`
        );
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", (event.pageX + 12) + "px")
        .style("top",  (event.pageY + 12) + "px");
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    });
}
