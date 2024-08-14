--SELECT location, date, total_cases, new_cases, total_deaths, population
--FROM PortfolioProject..CovidDeaths
--ORDER BY 1,2

SELECT * FROM PortfolioProject..CovidDeaths
ORDER BY 2,3

-- Looking at Total Cases vs Total Deaths

----Countries with highest death count per population
--Select continent, MAX(cast(total_deaths as int)) as TotalDeathCount
--From PortfolioProject..CovidDeaths
--Where continent is not null
--Group by continent 
--Order by TotalDeathCount desc

--GLOBAL NUMBERS
	--Query total deaths per day
--SELECT SUM(new_cases) as total_cases, SUM(cast(new_deaths as int)) as total_deaths, SUM(cast(new_deaths as int)) / SUM(new_cases)*100   
--FROM PortfolioProject..CovidDeaths
--WHERE continent is not null
--ORDER BY 1,2

WITH PopvsVac (Continent, Location, Date, Population, New_Vaccinations, RollingPeopleVaccinated)
as
(
SELECT dea.continent, dea.location, dea.date, dea.population, vac.new_vaccinations, 
	SUM(CONVERT(int, vac.new_vaccinations)) OVER (PARTITION BY dea.location ORDER BY dea.location, 
	dea.date) as RollingPeopleVaccinated
FROM PortfolioProject..CovidDeaths dea 
	JOIN PortfolioProject..CovidVaccinations vac
		ON dea.location = vac.location
			and dea.date = vac.date
	WHERE dea.continent is not null
	--ORDER BY 2,3
)

SELECT *, (RollingPeopleVaccinated/Population)
FROM PopvsVac

-- TEMP TABLE
DROP TABLE IF exists #PercentPopulationVaccinated
CREATE TABLE #PercentPopulationVaccinated (
	Continent nvarchar(255),
	Location nvarchar(255),
	Date datetime,
	Population numeric,
	New_vaccinations numeric,
	RollingPeopleVaccinated numeric
)

INSERT INTO #PercentPopulationVaccinated 
SELECT dea.continent, dea.location, dea.date, dea.population, vac.new_vaccinations, 
	SUM(CONVERT(int, vac.new_vaccinations)) OVER (PARTITION BY dea.location ORDER BY dea.location, 
	dea.date) as RollingPeopleVaccinated
FROM PortfolioProject..CovidDeaths dea 
	JOIN PortfolioProject..CovidVaccinations vac
		ON dea.location = vac.location
			and dea.date = vac.date
	WHERE dea.continent is not null
	--ORDER BY 2,3

-- Creating View to store data for later visualizations
CREATE VIEW PercentPopulationVaccinated as 
(
	SELECT dea.continent, dea.location, dea.date, dea.population, vac.new_vaccinations, 
		SUM(CONVERT(int, vac.new_vaccinations)) OVER (PARTITION BY dea.location ORDER BY dea.location, 
		dea.date) as RollingPeopleVaccinated
	FROM PortfolioProject..CovidDeaths dea 
		JOIN PortfolioProject..CovidVaccinations vac
			ON dea.location = vac.location
				and dea.date = vac.date
		WHERE dea.continent is not null
		--ORDER BY 2,3
)

SELECT *
FROM PercentPopulationVaccinated

