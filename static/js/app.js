document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.getElementById('patientForm');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const btnPredictBoth = document.getElementById('btnPredictBoth');
    const patientNameInput = document.getElementById('Patient_Name');
    const patientDisplayName = document.getElementById('patientDisplayName');
    
    // Prediction Output Elements
    const predictedCostValue = document.getElementById('predictedCostValue');
    const costProgress = document.getElementById('costProgress');
    const costPercentText = document.getElementById('costPercentText');
    const predictedOperationBadge = document.getElementById('predictedOperationBadge');
    const probProgress = document.getElementById('probProgress');
    const probPercentText = document.getElementById('probPercentText');
    
    // Interdependent Inputs
    const operationNeededInput = document.getElementById('Operation_Needed_Input');
    const treatmentCostInput = document.getElementById('Treatment_Cost_Input');
    
    // Feature Importance Chart Elements
    const toggleRegImp = document.getElementById('toggleRegImp');
    const toggleClfImp = document.getElementById('toggleClfImp');
    const importanceChart = document.getElementById('importanceChart');

    // Patient Directory Elements
    const patientSearchInput = document.getElementById('patientSearchInput');
    const patientListBody = document.getElementById('patientListBody');
    const groundTruthPanel = document.getElementById('groundTruthPanel');
    const gtCost = document.getElementById('gtCost');
    const gtOp = document.getElementById('gtOp');
    const tabBtnDemographics = document.querySelector('[data-tab="demographics"]');
    
    // Main View Navigation Elements
    const navButtons = document.querySelectorAll('.nav-navBtn, .nav-btn');
    const predictorView = document.getElementById('predictorView');
    const directoryView = document.getElementById('directoryView');
    const navBtnPredictor = document.querySelector('[data-view="predictor"]');

    // Care Plan Elements
    const carePlanPanel = document.getElementById('carePlanPanel');
    const dietSuggestionText = document.getElementById('dietSuggestionText');
    const medSuggestionText = document.getElementById('medSuggestionText');
    
    // State variables
    let metadata = {};
    let featureImportances = {};
    let patientsList = [];
    let currentImportanceView = 'regressor'; // or 'classifier'

    // Min and Max stats from dataset for calculating progress percentage
    const MIN_COST = 25065.0;
    const MAX_COST = 1067095.0;

    // 1. Initialize Form Tabs
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Toggle buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Toggle contents
            tabContents.forEach(content => {
                if (content.id === `tab-${targetTab}`) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });

    // Sync Patient Name with Display Header
    patientNameInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        patientDisplayName.textContent = `Patient: ${val || 'Anonymous'}`;
    });

    // 1.1 Main View Navigation Toggles
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetView = button.getAttribute('data-view');
            
            // Toggle nav active classes
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Toggle view visibility
            if (targetView === 'predictor') {
                predictorView.style.display = 'grid';
                directoryView.style.display = 'none';
            } else if (targetView === 'directory') {
                predictorView.style.display = 'none';
                directoryView.style.display = 'block';
            }
        });
    });

    // 2. Fetch Metadata & Populate Categorical Dropdowns
    async function loadMetadata() {
        try {
            const response = await fetch('/api/metadata');
            metadata = await response.json();
            
            const features = metadata.features;
            
            // Populate select inputs dynamically
            for (const [key, value] of Object.entries(features)) {
                if (value.type === 'categorical') {
                    const selectEl = document.getElementById(key);
                    if (selectEl) {
                        selectEl.innerHTML = '';
                        value.values.forEach(optionVal => {
                            const opt = document.createElement('option');
                            opt.value = optionVal;
                            opt.textContent = optionVal;
                            if (optionVal === value.default) {
                                opt.selected = true;
                            }
                            selectEl.appendChild(opt);
                        });
                    }
                }
            }
            
            // Hook slider values updates
            setupSliderEventListeners(features);
            
            console.log("Metadata loaded and dropdowns initialized.");
        } catch (error) {
            console.error("Error loading metadata:", error);
        }
    }

    // Update value badge next to sliders on-change
    function setupSliderEventListeners(features) {
        for (const [key, value] of Object.entries(features)) {
            if (value.type === 'numeric') {
                const slider = document.getElementById(key);
                const valueLabel = document.getElementById(`val-${key}`);
                if (slider && valueLabel) {
                    // Initial sync
                    valueLabel.textContent = slider.value;
                    
                    // Event listener
                    slider.addEventListener('input', (e) => {
                        valueLabel.textContent = e.target.value;
                    });
                }
            }
        }
    }

    // 3. Fetch Feature Importances
    async function loadFeatureImportances() {
        try {
            const response = await fetch('/api/feature_importance');
            const data = await response.json();
            if (data.status === 'success') {
                featureImportances = data;
                renderFeatureImportances();
            }
        } catch (error) {
            console.error("Error loading feature importances:", error);
            importanceChart.innerHTML = '<div class="chart-loading"><i class="fa-solid fa-triangle-exclamation"></i> Error loading chart data</div>';
        }
    }

    // Render the SVG/CSS bar charts
    function renderFeatureImportances() {
        importanceChart.innerHTML = '';
        
        const typeKey = currentImportanceView === 'regressor' ? 'regressor_importance' : 'classifier_importance';
        const importances = featureImportances[typeKey] || [];
        
        if (importances.length === 0) {
            importanceChart.innerHTML = '<div class="chart-loading">No data available</div>';
            return;
        }

        // Find max value to normalize widths
        const maxVal = Math.max(...importances.map(item => item[1]));

        importances.forEach(item => {
            const featureName = item[0].replace(/_/g, ' ');
            const value = item[1];
            // Calculate percentage width relative to max
            const percentWidth = maxVal > 0 ? (value / maxVal) * 100 : 0;
            const displayValue = value.toFixed(4);

            const row = document.createElement('div');
            row.className = 'chart-row';

            const label = document.createElement('div');
            label.className = 'chart-row-label';
            label.textContent = featureName;

            const track = document.createElement('div');
            track.className = 'chart-row-track';

            const bar = document.createElement('div');
            bar.className = `chart-row-bar ${currentImportanceView === 'regressor' ? 'bar-regressor' : 'bar-classifier'}`;
            
            // Animate width expansion
            setTimeout(() => {
                bar.style.width = `${percentWidth}%`;
            }, 50);

            const valText = document.createElement('div');
            valText.className = 'chart-row-value';
            valText.textContent = displayValue;

            track.appendChild(bar);
            row.appendChild(label);
            row.appendChild(track);
            row.appendChild(valText);
            
            importanceChart.appendChild(row);
        });
    }

    // Feature Importance View Toggle Event Listeners
    toggleRegImp.addEventListener('click', () => {
        toggleRegImp.classList.add('active');
        toggleClfImp.classList.remove('active');
        currentImportanceView = 'regressor';
        renderFeatureImportances();
    });

    toggleClfImp.addEventListener('click', () => {
        toggleClfImp.classList.add('active');
        toggleRegImp.classList.remove('active');
        currentImportanceView = 'classifier';
        renderFeatureImportances();
    });

    // Helper: Collect all inputs from the main form
    function getFormData() {
        const formData = new FormData(form);
        const data = {};
        for (const [key, value] of formData.entries()) {
            if (key === 'Patient_Name') {
                data[key] = value;
            } else {
                // If it's a numeric range slider, parse it as float
                const inputEl = document.getElementById(key);
                if (inputEl && inputEl.type === 'range') {
                    data[key] = parseFloat(value);
                } else {
                    data[key] = value;
                }
            }
        }
        return data;
    }

    // 4. Run predictions
    async function predictCost(baseData) {
        // Prepare payload (includes all form features + Operation_Needed from regressor card config)
        const payload = {
            ...baseData,
            "Operation_Needed": operationNeededInput.value
        };

        // UI state: loading
        predictedCostValue.classList.add('loading-placeholder');
        predictedCostValue.textContent = 'Calculating...';
        costProgress.style.width = '0%';

        try {
            const response = await fetch('/api/predict_cost', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            predictedCostValue.classList.remove('loading-placeholder');

            if (result.predicted_cost !== undefined) {
                const cost = result.predicted_cost;
                // Animate numbers or show
                predictedCostValue.textContent = Math.round(cost).toLocaleString();
                
                // Calculate percentage relative to MIN and MAX values in dataset
                let pct = ((cost - MIN_COST) / (MAX_COST - MIN_COST)) * 100;
                pct = Math.max(0, Math.min(100, pct)); // clamp
                
                costProgress.style.width = `${pct}%`;
                costPercentText.textContent = `${Math.round(pct)}% of max record`;

                // Update the interdependent Treatment_Cost input in the classifier card!
                treatmentCostInput.value = Math.round(cost);
            } else {
                predictedCostValue.textContent = "Error";
            }
        } catch (error) {
            console.error("Error predicting cost:", error);
            predictedCostValue.classList.remove('loading-placeholder');
            predictedCostValue.textContent = "Error";
        }
    }

    async function predictOperation(baseData) {
        // Prepare payload (includes all form features + Treatment_Cost from classifier card config)
        const payload = {
            ...baseData,
            "Treatment_Cost": parseFloat(treatmentCostInput.value)
        };

        // UI state: reset badge
        predictedOperationBadge.className = 'op-badge op-unknown';
        predictedOperationBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>CHECKING...</span>';
        probProgress.style.width = '0%';
        probPercentText.textContent = '--%';

        try {
            const response = await fetch('/api/predict_operation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.prediction !== undefined) {
                const isYes = result.prediction === 'Yes';
                const prob = result.probability_yes; // probability of YES
                const confidencePercent = Math.round(isYes ? prob * 100 : (1 - prob) * 100);

                // Update badge aesthetics
                predictedOperationBadge.className = `op-badge ${isYes ? 'op-yes' : 'op-no'}`;
                predictedOperationBadge.innerHTML = isYes 
                    ? '<i class="fa-solid fa-circle-exclamation"></i> <span>YES (SURGERY)</span>'
                    : '<i class="fa-solid fa-circle-check"></i> <span>NO (STABLE)</span>';

                // Update progress bar showing probability of operation
                probProgress.style.width = `${prob * 100}%`;
                probPercentText.textContent = `${confidencePercent}% confidence`;

                // Update the interdependent Operation_Needed select in the regressor card!
                operationNeededInput.value = result.prediction;
            } else {
                predictedOperationBadge.className = 'op-badge op-unknown';
                predictedOperationBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span>ERROR</span>';
            }
        } catch (error) {
            console.error("Error predicting operation:", error);
            predictedOperationBadge.className = 'op-badge op-unknown';
            predictedOperationBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span>ERROR</span>';
        }
    }

    // 5. Predict All Event Handler
    btnPredictBoth.addEventListener('click', async () => {
        const baseData = getFormData();
        
        // Run both predictions in parallel!
        await Promise.all([
            predictCost(baseData),
            predictOperation(baseData)
        ]);

        // Generate Care Plan suggestions based on inputs and prediction outputs
        updateClinicalCarePlan(baseData.Disease_Type, baseData.Medication_Count, operationNeededInput.value);

        console.log("Inferences completed and interdependent cards updated.");
    });

    // 5.1 Update Clinical Care Plan suggestions based on Disease Type and predicted Operation
    function updateClinicalCarePlan(diseaseType, medicationCount, operationNeeded) {
        const dietSuggestions = {
            "Diabetes": "<strong>Low Glycemic / Diabetic Diet:</strong> Restrict refined carbohydrates, sweets, and high-sugar foods. Emphasize high-fiber vegetables, lean proteins (chicken, fish), and complex carbohydrates (oats, brown rice). Monitor blood sugar levels closely and maintain consistent meal schedules.",
            "Heart Disease": "<strong>Cardiac / Low-Sodium Diet (DASH):</strong> Limit sodium intake to < 1,500 - 2,000 mg per day to manage blood pressure. Restrict saturated and trans fats. Increase dietary intake of Omega-3 fatty acids (salmon, walnuts), leafy greens, whole grains, and antioxidant-rich fruits.",
            "Kidney Disease": "<strong>Renal Diet Guidelines:</strong> Carefully regulate dietary protein intake to reduce renal workload. Restrict sodium, potassium, and phosphorus. Limit foods like bananas, potatoes, dairy, and colas. Ensure fluid intake is matched with clinical fluid outputs.",
            "Fever": "<strong>Hydration-focused & Bland Diet:</strong> Prioritize electrolyte solutions, herbal teas, clear broths, and water to replace fluids lost due to sweating and hyperthermia. Eat soft, easily digestible meals (toast, plain rice, applesauce) in small, frequent portions.",
            "Respiratory Infection": "<strong>Immune-Support & Hydrating Diet:</strong> Focus on warm liquids (lemon-honey water, decaffeinated tea, warm broths) to soothe airways. Incorporate anti-inflammatory foods (garlic, ginger, turmeric) and vitamins rich in Zinc and Vitamin C (citrus, bell peppers).",
            "Not Available": "<strong>General Balanced Diet:</strong> Maintain balanced macronutrient proportions. Focus on fiber-rich whole foods, raw vegetables, clean proteins, and drink at least 2-3 liters of clean water daily. Avoid processed sugars and deep-fried foods."
        };

        const defaultDiet = "<strong>General Balanced Diet:</strong> Maintain balanced macronutrient proportions. Focus on fiber-rich whole foods, raw vegetables, clean proteins, and drink at least 2-3 liters of clean water daily. Avoid processed sugars and deep-fried foods.";

        // Set diet text
        dietSuggestionText.innerHTML = dietSuggestions[diseaseType] || defaultDiet;

        // Medication and care suggestions logic
        let medGuide = "";
        
        if (operationNeeded === "Yes") {
            medGuide += "<strong>⚠️ Pre-Operative Fasting (NPO):</strong> Patient is predicted to require surgery. Strict NPO (nothing by mouth/fasting) protocol must be initiated 8 hours prior to the scheduled procedure.<br><br>";
            medGuide += "<strong>💊 Pre-op Medication Guide:</strong> Consult with the anesthesia team regarding home medications. Anticoagulants (blood thinners), NSAIDs, and oral hypoglycemics (diabetes pills) must typically be held. Vital medications can be taken with a sip of water under directive.";
        } else {
            medGuide += "<strong>✅ Conservative Management:</strong> Maintain current medication adherence strictly. Do not stop or modify prescribed dosages without consulting your cardiologist or physician.<br><br>";
            medGuide += "<strong>🩺 Follow-up Care:</strong> Schedule a clinical reassessment in 7-14 days. Monitor daily vitals (BP, Heart Rate, SpO2) and seek immediate emergency care if symptoms worsen.";
        }

        // Add warning for high medication count (polypharmacy risk)
        if (medicationCount >= 6) {
            medGuide += `<br><br><span style="color: #fb7185; font-weight: 700;"><i class="fa-solid fa-triangle-exclamation"></i> Polypharmacy Warning:</span> The patient is currently prescribed ${medicationCount} medications. Recommend a complete clinical pharmacist reconciliation review to minimize drug-drug interactions and side effects.`;
        }

        medSuggestionText.innerHTML = medGuide;

        // Display panel
        carePlanPanel.style.display = 'block';
    }

    // 6. Handle interactive triggers on card manual input changes
    // If user changes 'Operation Needed' manual toggle, re-predict Cost
    operationNeededInput.addEventListener('change', () => {
        const baseData = getFormData();
        predictCost(baseData);
    });

    // If user changes 'Treatment Cost' manual entry, re-predict Operation
    treatmentCostInput.addEventListener('change', () => {
        const baseData = getFormData();
        predictOperation(baseData);
    });

    // 7. Patient Directory Implementation
    async function loadPatientsDirectory() {
        try {
            const response = await fetch('/api/patients');
            const data = await response.json();
            if (data.status === 'success') {
                patientsList = data.patients;
                renderPatientsTable();
            } else {
                patientListBody.innerHTML = '<tr><td colspan="4" class="text-center">Failed to load directory.</td></tr>';
            }
        } catch (error) {
            console.error("Error loading patient directory:", error);
            patientListBody.innerHTML = '<tr><td colspan="4" class="text-center">Error loading directory.</td></tr>';
        }
    }

    function renderPatientsTable(filterText = '') {
        patientListBody.innerHTML = '';
        const search = filterText.toLowerCase();
        
        const filtered = patientsList.filter(p => {
            const name = (p.Patient_Name || '').toLowerCase();
            const disease = (p.Disease_Type || '').toLowerCase();
            const gender = (p.Gender || '').toLowerCase();
            return name.includes(search) || disease.includes(search) || gender.includes(search);
        });

        if (filtered.length === 0) {
            patientListBody.innerHTML = '<tr><td colspan="9" class="text-center">No patients found.</td></tr>';
            return;
        }

        filtered.forEach(p => {
            const row = document.createElement('tr');
            
            const nameCell = document.createElement('td');
            nameCell.innerHTML = `<strong>${p.Patient_Name}</strong>`;
            
            const ageSexCell = document.createElement('td');
            ageSexCell.textContent = `${Math.round(p.Age)} / ${p.Gender}`;

            const bloodCell = document.createElement('td');
            bloodCell.textContent = p.Blood_Group;
            
            const diseaseCell = document.createElement('td');
            diseaseCell.textContent = p.Disease_Type;

            const severityCell = document.createElement('td');
            severityCell.textContent = p.Disease_Severity;

            const stayCell = document.createElement('td');
            stayCell.textContent = `${Math.round(p.Hospital_Stay_Days)} Days`;

            const costCell = document.createElement('td');
            costCell.textContent = `₹${Math.round(p.Treatment_Cost).toLocaleString()}`;

            const opCell = document.createElement('td');
            const opBadge = document.createElement('span');
            opBadge.className = `gt-badge ${p.Operation_Needed === 'Yes' ? 'gt-badge-yes' : 'gt-badge-no'}`;
            opBadge.textContent = p.Operation_Needed;
            opCell.appendChild(opBadge);
            
            const actionCell = document.createElement('td');
            const loadBtn = document.createElement('button');
            loadBtn.type = 'button';
            loadBtn.className = 'load-btn';
            loadBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Load';
            loadBtn.setAttribute('data-id', p.id);
            actionCell.appendChild(loadBtn);
            
            row.appendChild(nameCell);
            row.appendChild(ageSexCell);
            row.appendChild(bloodCell);
            row.appendChild(diseaseCell);
            row.appendChild(severityCell);
            row.appendChild(stayCell);
            row.appendChild(costCell);
            row.appendChild(opCell);
            row.appendChild(actionCell);
            
            patientListBody.appendChild(row);
        });
    }

    // Search input listener
    patientSearchInput.addEventListener('input', (e) => {
        renderPatientsTable(e.target.value.trim());
    });

    // Patient selection click listener (delegated to table body)
    patientListBody.addEventListener('click', async (e) => {
        const loadBtn = e.target.closest('.load-btn');
        if (!loadBtn) return;
        
        const pId = parseInt(loadBtn.getAttribute('data-id'));
        const patient = patientsList.find(p => p.id === pId);
        
        if (!patient) return;
        
        console.log("Loading patient profile:", patient);
        
        // 1. Populate form fields
        for (const [key, val] of Object.entries(patient)) {
            const inputEl = document.getElementById(key);
            if (inputEl) {
                inputEl.value = val;
                
                // If it is a slider range input, update the visual label next to it
                if (inputEl.type === 'range') {
                    const labelVal = document.getElementById(`val-${key}`);
                    if (labelVal) {
                        labelVal.textContent = val;
                    }
                }
            }
        }
        
        // Sync header name display
        patientDisplayName.textContent = `Patient: ${patient.Patient_Name}`;
        
        // 2. Set the interdependent inputs in cards
        treatmentCostInput.value = Math.round(patient.Treatment_Cost);
        operationNeededInput.value = patient.Operation_Needed;
        
        // 3. Show and Populate Ground Truth Panel
        gtCost.textContent = `₹${Math.round(patient.Treatment_Cost).toLocaleString()}`;
        gtOp.textContent = patient.Operation_Needed;
        gtOp.className = `gt-badge ${patient.Operation_Needed === 'Yes' ? 'gt-badge-yes' : 'gt-badge-no'}`;
        groundTruthPanel.style.display = 'block';
        
        // 4. Switch view back to Predictor Dashboard
        if (navBtnPredictor) {
            navBtnPredictor.click();
        }

        // Switch back to Basics tab (demographics)
        if (tabBtnDemographics) {
            tabBtnDemographics.click();
        }
        
        // 5. Automatically run predictions!
        btnPredictBoth.click();
    });

    // Init Calls
    loadMetadata();
    loadFeatureImportances();
    loadPatientsDirectory();
});
