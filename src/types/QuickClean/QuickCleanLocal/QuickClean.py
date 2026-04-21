import pandas as pd
import re
from datetime import datetime
import os

def clean_billing_data(file_path):
    xl = pd.ExcelFile(file_path)
    all_cleaned_data = []

    expected_headers = ["Patient", "Type", "Code", "Qty", "Description", "Debit", "Credit", "Adj", "Tax", "Net"]

    for sheet_name in xl.sheet_names:
        df = xl.parse(sheet_name, dtype=str).fillna("")
        i = 0

        while i < len(df):
            row_values = [str(cell).strip() for cell in df.iloc[i].tolist()]
            header_map = {header: idx for idx, val in enumerate(row_values) if val in expected_headers for header in [val]}

            if len(header_map) >= 6:
                data_start = i + 1
                data_rows = []

                for j in range(data_start, len(df)):
                    first_cell = str(df.iloc[j, 0]).strip()
                    if re.match(r"^Totals for", first_cell, re.IGNORECASE):
                        i = j + 1
                        break

                    row = df.iloc[j].tolist()
                    aligned_row = [row[header_map.get(col, "")] if header_map.get(col, "") < len(row) else "" for col in expected_headers]
                    if any(str(cell).strip() for cell in aligned_row):
                        data_rows.append(aligned_row)
                else:
                    i += 1

                if data_rows:
                    block_df = pd.DataFrame(data_rows, columns=expected_headers)
                    all_cleaned_data.append(block_df)
            else:
                i += 1

    if not all_cleaned_data:
        raise ValueError("No valid data blocks found.")

    cleaned_df = pd.concat(all_cleaned_data, ignore_index=True)

    # Convert numeric columns from strings to numbers
    numeric_cols = ["Qty", "Debit", "Credit", "Adj", "Tax", "Net"]
    for col in numeric_cols:
        cleaned_df[col] = pd.to_numeric(cleaned_df[col].replace(r'[^\d\.-]', '', regex=True), errors='coerce')

    today = datetime.today().strftime("%Y-%m-%d")
    output_filename = f"Cleaned Data {today}.xlsx"
    output_path = os.path.join(os.getcwd(), output_filename)

    cleaned_df.to_excel(output_path, index=False)
    return output_path

# ----------------------------
# Standalone Runner
# ----------------------------
if __name__ == "__main__":
    try:
        input_file = input("Enter the path to the Excel file: ").strip()

        if not os.path.isfile(input_file):
            print("❌ File not found:", input_file)
        else:
            result_path = clean_billing_data(input_file)

            # Move to same folder as input
            final_path = os.path.join(os.path.dirname(input_file), os.path.basename(result_path))
            os.replace(result_path, final_path)

            print(f"\n✅ Cleaned file created:\n{final_path}")

    except Exception as e:
        print("⚠️ An error occurred:", str(e))

    input("\nPress ENTER to exit...")
