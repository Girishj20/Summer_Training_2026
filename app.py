import os
import pickle
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify, render_template

app = Flask(__name__, 
            static_folder="static", 
            template_folder="templates")

# Paths to models
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

# Load models and encoders
try:
    with open(os.path.join(MODELS_DIR, "dt_regressor.pkl"), "rb") as f:
        dt_reg = pickle.load(f)
    with open(os.path.join(MODELS_DIR, "dt_classifier.pkl"), "rb") as f:
        dt_clf = pickle.load(f)
    with open(os.path.join(MODELS_DIR, "label_encoders.pkl"), "rb") as f:
        label_encoders = pickle.load(f)
    with open(os.path.join(MODELS_DIR, "regressor_features.pkl"), "rb") as f:
        reg_features = pickle.load(f)
    with open(os.path.join(MODELS_DIR, "classifier_features.pkl"), "rb") as f:
        clf_features = pickle.load(f)
    print("All models and encoders loaded successfully.")
except Exception as e:
    print(f"Error loading models: {e}")
    dt_reg = dt_clf = label_encoders = reg_features = clf_features = None

# Feature metadata for the UI (dynamic dropdowns and sliders)
FEATURE_METADATA = {
    "Age": {"type": "numeric", "min": 18, "max": 90, "default": 54},
    "Gender": {"type": "categorical", "values": ["Female", "Male"], "default": "Male"},
    "Blood_Group": {"type": "categorical", "values": ["A+", "A-", "AB+", "AB-", "B+", "B-", "O+", "O-"], "default": "O+"},
    "Height_cm": {"type": "numeric", "min": 140, "max": 200, "default": 170},
    "Weight_kg": {"type": "numeric", "min": 40, "max": 120, "default": 80},
    "Blood_Pressure": {"type": "numeric", "min": 90, "max": 190, "default": 140},
    "Heart_Rate": {"type": "numeric", "min": 55, "max": 130, "default": 93},
    "Oxygen_Level": {"type": "numeric", "min": 85, "max": 100, "default": 93},
    "Blood_Sugar": {"type": "numeric", "min": 70, "max": 260, "default": 164},
    "Temperature": {"type": "numeric", "min": 36.0, "max": 40.0, "step": 0.1, "default": 38.0},
    "Cholesterol": {"type": "numeric", "min": 120, "max": 300, "default": 208},
    "Disease_Type": {"type": "categorical", "values": ["Diabetes", "Fever", "Heart Disease", "Kidney Disease", "Not Available", "Respiratory Infection"], "default": "Heart Disease"},
    "Disease_Severity": {"type": "categorical", "values": ["High", "Low", "Medium"], "default": "Medium"},
    "Previous_Disease": {"type": "categorical", "values": ["No", "Yes"], "default": "No"},
    "Family_History": {"type": "categorical", "values": ["No", "Yes"], "default": "No"},
    "Emergency_Case": {"type": "categorical", "values": ["No", "Yes"], "default": "No"},
    "ICU_Required": {"type": "categorical", "values": ["No", "Yes"], "default": "No"},
    "Medication_Count": {"type": "numeric", "min": 0, "max": 10, "default": 5},
    "Doctor_Visits": {"type": "numeric", "min": 0, "max": 15, "default": 8},
    "Insurance_Type": {"type": "categorical", "values": ["Government", "Not Available", "Private"], "default": "Private"},
    "Exercise_Level": {"type": "categorical", "values": ["High", "Low", "Medium"], "default": "Medium"},
    "Smoking_Status": {"type": "categorical", "values": ["Daily", "Never", "Occasionally"], "default": "Never"},
    "Alcohol_Status": {"type": "categorical", "values": ["High", "Moderate", "Not Available"], "default": "Not Available"},
    "Diet_Type": {"type": "categorical", "values": ["Healthy", "Mixed", "Poor"], "default": "Healthy"},
    "Condition_Level": {"type": "categorical", "values": ["Critical", "Mild", "Normal"], "default": "Normal"},
    "Hospital_Stay_Days": {"type": "numeric", "min": 1, "max": 25, "default": 15},
    "Room_Allotted": {"type": "categorical", "values": ["Emergency Room", "General Room", "ICU", "Operation Ward", "Private Room"], "default": "General Room"},
}

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/metadata", methods=["GET"])
def get_metadata():
    return jsonify({
        "features": FEATURE_METADATA,
        "regressor_features": reg_features,
        "classifier_features": clf_features
    })

@app.route("/api/patients", methods=["GET"])
def get_patients():
    excel_path = os.path.join(os.path.dirname(__file__), "Hospital_Dataset.xlsx")
    try:
        df_excel = pd.read_excel(excel_path)
        patients_list = []
        for idx, row in df_excel.head(100).iterrows():
            p_data = row.to_dict()
            p_data = {k: (None if pd.isna(v) else v) for k, v in p_data.items()}
            p_data["id"] = int(idx)
            patients_list.append(p_data)
        return jsonify({
            "status": "success",
            "patients": patients_list
        })
    except Exception as e:
        print(f"Error loading patients: {e}")
        return jsonify({"error": str(e)}), 500

def preprocess_features(data, feature_list):
    """
    Encode and order incoming features to match the exact list required by the model.
    """
    processed = {}
    for col in feature_list:
        val = data.get(col)
        
        # If missing, use metadata default
        if val is None:
            if col in FEATURE_METADATA:
                val = FEATURE_METADATA[col]["default"]
            elif col == "Treatment_Cost":
                val = 542854.0 # default mean treatment cost
            elif col == "Operation_Needed":
                val = "No" # default
                
        # If categorical column, run it through the LabelEncoder
        if col in label_encoders and col != "Patient_Name":
            le = label_encoders[col]
            val_str = str(val).strip()
            # Handle case where value might not be in target classes (should not happen with dropdowns)
            if val_str in le.classes_:
                encoded_val = int(le.transform([val_str])[0])
            else:
                # Default to the first class if invalid
                encoded_val = 0
            processed[col] = encoded_val
        else:
            # Numeric columns
            processed[col] = float(val)
            
    # Convert to DataFrame with columns in exact order
    df_pred = pd.DataFrame([processed], columns=feature_list)
    return df_pred

@app.route("/api/predict_cost", methods=["POST"])
def predict_cost():
    if dt_reg is None or reg_features is None:
        return jsonify({"error": "Regressor model not loaded"}), 500
        
    try:
        data = request.json
        print("Received predict_cost request data:", data)
        
        # Preprocess features
        X_encoded = preprocess_features(data, reg_features)
        
        # Predict
        predicted_val = dt_reg.predict(X_encoded)[0]
        
        return jsonify({
            "predicted_cost": float(predicted_val),
            "status": "success"
        })
    except Exception as e:
        print(f"Error in predict_cost: {e}")
        return jsonify({"error": str(e)}), 400

@app.route("/api/predict_operation", methods=["POST"])
def predict_operation():
    if dt_clf is None or clf_features is None:
        return jsonify({"error": "Classifier model not loaded"}), 500
        
    try:
        data = request.json
        print("Received predict_operation request data:", data)
        
        # Preprocess features
        X_encoded = preprocess_features(data, clf_features)
        
        # Predict
        predicted_val = dt_clf.predict(X_encoded)[0]
        
        # Map predicted integer back to label string
        le = label_encoders["Operation_Needed"]
        predicted_label = le.inverse_transform([predicted_val])[0]
        
        # Optional: predict probabilities if model supports it
        try:
            probabilities = dt_clf.predict_proba(X_encoded)[0]
            prob_yes = float(probabilities[1]) if len(probabilities) > 1 else 1.0 if predicted_val == 1 else 0.0
        except Exception:
            prob_yes = 1.0 if predicted_val == 1 else 0.0
            
        return jsonify({
            "prediction": predicted_label,
            "prediction_code": int(predicted_val),
            "probability_yes": prob_yes,
            "status": "success"
        })
    except Exception as e:
        print(f"Error in predict_operation: {e}")
        return jsonify({"error": str(e)}), 400

@app.route("/api/feature_importance", methods=["GET"])
def get_feature_importance():
    if dt_reg is None or dt_clf is None:
        return jsonify({"error": "Models not loaded"}), 500
        
    try:
        # Regressor importances
        reg_imp = dt_reg.feature_importances_
        reg_imp_dict = {feat: float(imp) for feat, imp in zip(reg_features, reg_imp)}
        # Sort desc
        sorted_reg_imp = sorted(reg_imp_dict.items(), key=lambda x: x[1], reverse=True)
        
        # Classifier importances
        clf_imp = dt_clf.feature_importances_
        clf_imp_dict = {feat: float(imp) for feat, imp in zip(clf_features, clf_imp)}
        # Sort desc
        sorted_clf_imp = sorted(clf_imp_dict.items(), key=lambda x: x[1], reverse=True)
        
        return jsonify({
            "regressor_importance": sorted_reg_imp[:10], # top 10
            "classifier_importance": sorted_clf_imp[:10], # top 10
            "status": "success"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
